const Triton = require("@triton-one/yellowstone-grpc");
const bs58 = require('bs58').default
const GeyserTransaction = require('./GeyserTransaction');
const Geysers = require('./Geysers');
const Time = require("./Time");

module.exports = class Geyser {
    sett = {
        ms_timeout_router_on_error_1_13: 2_000,
        ms_inter_ping: 20_000,
    }

    id = null
    url = null
    apikey = null
    owner_addr = null

    stream = null
    states = { play: false, connect: false, busy: false,}
    max_slot = null

    timeout_router = null//id таймаут
    interval_ping = null//id интервал

    ms_timeout_router_on_error = null//variable

    stat = {
        on_data: 0,//not only transactions
        on_error: 0,
        bad_transaction: 0,
        attempt_connect: 0,
        last_err_code: null,
        last_offset_leader: null
    }

    constructor(id, url, apikey, owner_addr = null) {
        this.url = url
        this.apikey = apikey
        this.id = id
        this.owner_addr = owner_addr
        this.#router()
    }

    #router(is_reason_restart = false) {
        clearTimeout(this.timeout_router)
        if (this.states.busy) return

        if (is_reason_restart) {
            if (this.states.play) {
                //async func
                this.#connectOrDisconnect(!this.states.connect)
            }
        } else {
            if (this.states.play ^ this.states.connect) {
                //async func
                this.#connectOrDisconnect(this.states.play)
            }
        }
    }

    async #connectOrDisconnect(is_play) {
        this.states.busy = true

        if (!is_play) {
            this.stream.cancel()
            this.stream.destroy()
            return
        }

        this.stat.attempt_connect++
        const apikey = (this.apikey === null ? undefined : this.apikey)

        this.client = new Triton.default(this.url, apikey)
        this.stream = await this.client.subscribe()

        this.stream.on("error", this.#onError.bind(this))
        this.stream.on("end", this.#onKilled.bind(this))
        this.stream.on("close", this.#onKilled.bind(this))
        this.stream.on("data", this.#onData.bind(this))

        this.writeSubscriptionData()

        if (this.url !== 'https://rabbitstream.fra.shyft.to') {
            this.interval_ping = setInterval(this.writeSubscriptionDataPing.bind(this), this.sett.ms_inter_ping)
        }

        this.states.connect = true
        this.states.busy = false
        this.#router()
    }

    writeSubscriptionData() {
        this.stream.write({
            slots: {},
            transactions: {
                subscription1: {
                    vote: false,
                    failed: false,
                    signature: undefined,
                    accountInclude: ['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'],
                    accountExclude: [],
                    accountRequired: [],
                },
                subscription2: {
                    vote: false,
                    failed: false,
                    signature: undefined,
                    accountInclude: (this.owner_addr === null ? [] : [this.owner_addr]),
                    accountExclude: [],
                    accountRequired: [],
                },
            },
            commitment: Triton.CommitmentLevel.PROCESSED,
            accounts: {},
            transactionsStatus: {},
            entry: {},
            blocks: {},
            blocksMeta: {},
            accountsDataSlice: [],
            ping: undefined,
            //fromSlot: '341784796' //publicnode - not supported
        })
    }

    writeSubscriptionDataPing() {
        this.stream.write({
            slots: {},
            transactions: {
                ping_subscription: {
                    vote: false,
                    failed: false,
                    signature: undefined,
                    accountInclude: [],
                    accountExclude: [],
                    accountRequired: [],
                },
            },
            commitment: Triton.CommitmentLevel.PROCESSED,
            accounts: {},
            transactionsStatus: {},
            entry: {},
            blocks: {},
            blocksMeta: {},
            accountsDataSlice: [],
            ping: true,// todo ping!
            //fromSlot: '341784796' //publicnode - not supported
        })
    }

    #onTransaction(sign, raw, tspGrpc) {
        const int_slot = +raw.transaction.slot

        if (this.max_slot !== null) {
            if (int_slot < this.max_slot) {
                return
            }
        }

        this.max_slot = int_slot

        if (Geysers.max_slot !== null) {
            if (int_slot < Geysers.max_slot) {
                return
            }
        }

        Geysers.max_slot = int_slot

        if (sign in Geysers.trs.assoc) {
            this.stat.last_offset_leader = tspGrpc.ts - Geysers.trs.assoc[sign].ts_grpc
            return
        }

        const tr = new GeyserTransaction(sign, raw, tspGrpc, this.url)
        Geysers.push(tr)
    }

    #onData(resp) {
        const tspGrpc = {
            ts: Date.now(),
            tsp: performance.now()
        }

        this.stat.on_data++

        if (!('transaction' in resp)) return
        if (resp.transaction === undefined || !('transaction' in resp.transaction)) return

        let sign

        try {
            sign = bs58.encode(resp.transaction.transaction.signature)
            this.#onTransaction(sign, resp, tspGrpc)
        } catch (exc) {
            this.stat.bad_transaction++
            errlog(Time.getTime(), `Geyser #${this.id} exception onData`, {sign, exc})
        }
    }

    #onKilled() {
        this.states.connect = false
        this.states.busy = false
        clearInterval(this.interval_ping)

        if (this.ms_timeout_router_on_error === null) {
            this.#router()
        } else {
            this.timeout_router = setTimeout(this.#router.bind(this), this.ms_timeout_router_on_error)
            this.ms_timeout_router_on_error = null
        }
    }

    #onError(err) {
        this.states.busy = true // надо дождаться события "eonEnd/eonClose"(".#eonKilled()")

        if (err.code === 1) return

        this.stat.on_error++
        this.stat.last_err_code = err.code

        if (err.code === 13) {
            if (err.message === '13 INTERNAL: Request message serialization failure: The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received undefined') {
                this.ms_timeout_router_on_error = this.sett.ms_timeout_router_on_error_1_13
            }
        } else {
            this.ms_timeout_router_on_error = this.sett.ms_timeout_router_on_error_1_13
        }

        errlog(Time.getTime(), `Geyser #${this.id} onError`, {code: err.code})
    }

    playOrStopOrRestart(is_play_or_null_for_restart = null) {
        const event = is_play_or_null_for_restart

        if (event !== null) {
            this.states.play = event
        }

        this.#router(event === null)
    }
}