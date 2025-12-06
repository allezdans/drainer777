global.log = console.log.bind(console)
global.errlog = console.error.bind(console)

const ts_start = Date.now()

const bs58 = require('bs58').default
const Geysers = require('./Geysers')
const Time = require('./Time')
const {Keypair, Connection} = require('@solana/web3.js');

const {
    logTime, errlogTime, heatUrls, generateTransaction,
    getFetchRequestOptionsForSendTransaction
} = require('./functions')


const sett = {
    //~~~~~~~ КОШЕЛЕК С 10 SOL
    private_key: '4jA3vDFa321PS8mMAgFtkooc4kqW82oN9R67rA77QWk6NjLsNFaHy9xBWSgqxbbK7cUgT4xeFS1sBGDq3CbTJSP9',
    periphery_rpc_url: 'https://rpc.shyft.to?api_key=l7DPrftz2NehGFLq',

    //~~~~~~~~ настройки гейзеров в Geysers.js
    //~~~~~~~~~ ЗАМЕНИТЬ АПИ-КЛЮЧ ГЕЙЗЕРОВ !

    heat_urls: [
        'https://rpc.shyft.to',
        'https://mainnet.block-engine.jito.wtf',//5m
        'https://rpc.shyft.to',//5m
        'https://solana-rpc.publicnode.com',//5m
        'https://mainnet.helius-rpc.com',//5m
        'https://solana-mainnet.g.alchemy.com',//4m
        'https://solana.drpc.org',//5m
        'https://solana.therpc.io',//head не может //3m
        'https://public.rpc.solanavibestation.com',//1m
        'https://api.mainnet-beta.solana.com',//10s
        'https://solana.api.onfinality.io',//1m
        'https://solana.leorpc.com',//30s
        'https://solana.lavenderfive.com',//5m
        'https://solana.rpc.grove.city',//5m
        'https://api.blockeden.xyz',//4m
        'https://go.getblock.us',//5m
        'https://solana-mainnet.api.syndica.io',//3m
        'http://frankfurt.solana.blockrazor.xyz:443',//4m
        'http://newyork.solana.blockrazor.xyz:443',//4m
        'http://tokyo.solana.blockrazor.xyz:443',//4m
        'http://amsterdam.solana.blockrazor.xyz:443',//4m
        'http://de1.0slot.trade',//4m
        'http://ny1.0slot.trade',//4m
        'https://edge.erpc.global',//15
        'https://amsterdam.mainnet.block-engine.jito.wtf',//5m
        'https://frankfurt.mainnet.block-engine.jito.wtf',//5m
        'https://london.mainnet.block-engine.jito.wtf',//5m
        'https://dublin.mainnet.block-engine.jito.wtf',//5m
        'https://singapore.mainnet.block-engine.jito.wtf',//5m
    ],
    send_transaction_urls: [
        'https://rpc.shyft.to?api_key=103-8BRzoYGAAbpw',
        'https://solana-rpc.publicnode.com',
        'http://mainnet.helius-rpc.com/?api-key=5bbb135a-9b00-467f-9c23-0d1ac671bebb',
        'https://solana-mainnet.g.alchemy.com/v2/dWRo0zt9eV96VUv6LcANP',
        'https://solana.drpc.org',
        'https://solana.therpc.io',
        'https://public.rpc.solanavibestation.com/',
        'https://api.mainnet-beta.solana.com',
        'http://solana.api.onfinality.io/public',
        'https://solana.leorpc.com/?api_key=FREE',
        'https://solana.lavenderfive.com/',
        'https://solana.rpc.grove.city/v1/01fdb492',
        'https://api.blockeden.xyz/solana/KeCh6p22EX5AeRHxMSmc',
        'http://go.getblock.us/86aac42ad4484f3c813079afc201451c',
        'https://solana-mainnet.api.syndica.io/api-key/2gkp9FQCFQJcfVdDFYq2WkqPoSWVpg7jW8iztAZdo7ZWQjoCdM9wGUVdQ5VgaWfHSqA1JZhF8Z6izQn6DFtdYhqd8LkyXWhLY83',
        'https://edge.erpc.global?api-key=ebb80301-8881-484a-a665-094f77f1f3b6'
    ],
    ms_minimal_inter_update_blockhash: 60_000,
    ms_minimal_inter_get_slot: 60_000,

    ms_inter_send_first_transaction: 1_000,
    ms_minimal_inter_send_transaction: 3_000,

    ms_inter_heat_urls: 10_000,
    ms_inter_geysers_stat: 60_000
}

const owner = Keypair.fromSecretKey(bs58.decode(sett.private_key))
const owner_addr = owner.publicKey.toString()
const connect = new Connection(sett.periphery_rpc_url)
let blockhash = null
let rpc_max_slot = 0
let sol_lamports_transfer_for_unique = 0// обнуляется когда приходит новый блокхеш
const mySigns = {}// ключ - сигнатура, {ts_pre_send: <TIMESTAMP>, }

const stat = {min: 9_999_999_999, max: 0, ms_sum: 0, attempt_send: 0, sended: 0, listed: 0}

const fUpdateBlockhash = () => {
    connect.getLatestBlockhash({commitment: 'confirmed'}).then(resp => {
        logTime('Blockhash updated.', `lastValidBlockHeight: ${resp.lastValidBlockHeight}`)
        blockhash = resp.blockhash
        sol_lamports_transfer_for_unique = 0
    }).catch(err => {
        errlogTime('Blockhash error', {code: err.code})
    }).finally(() => {
        setTimeout(fUpdateBlockhash.bind(this), sett.ms_minimal_inter_update_blockhash)
    })
}

const fGetSlot = () => {
    connect.getSlot({commitment: 'processed'}).then(slot => {
        if (rpc_max_slot >= slot) return
        rpc_max_slot = slot

        logTime(
            `Max RPC slot: ${slot}.`,
            `Max Geysers slot: ${Geysers.max_slot}.`,
            `Смещение: ${Geysers.max_slot - slot}.`
        )
    }).catch(err => {
        errlogTime('Get slot error', {code: err.code})
    }).finally(()=>{
        setTimeout(fGetSlot.bind(this), sett.ms_minimal_inter_get_slot)
    })
}

const fSendTransaction = async () => {
    const ts_exec_send_func = Date.now()
    const tsp_exec_send_func = performance.now()

    if (blockhash === null) {
        logTime('fSendTransaction: no available blockhash.')
        return
    }

    //logTime('Генерация транзакции...')

    const {sign, base64_serialized} = generateTransaction(blockhash, owner, sol_lamports_transfer_for_unique)
    sol_lamports_transfer_for_unique += 1

    const requestOptions = getFetchRequestOptionsForSendTransaction(base64_serialized, true)

    const generate_time = performance.now() - tsp_exec_send_func
    //logTime(`~~~~~~ Время генерации транзы ` + +generate_time.toFixed(2) + ` мс. ${sign}`)

    mySigns[sign] = {ts_pre_send: Date.now()}
    stat.attempt_send++
    let is_sended = false

    for (let i = 0; i < sett.send_transaction_urls.length; i++) {
        const url = sett.send_transaction_urls[i]

        const fOnError = (http_code, is_invalid_json) => {
            // errlogTime(
            //     'Transaction err.',
            //     `Code: ${http_code}. Invalid json: ${+is_invalid_json}.`,
            //     `Short sign: ${short_sign}. URL: ${url}.`
            // )
        }

        fetch(url, requestOptions).then(async (resp) => {
            const http_code = resp.status
            let is_invalid_json = false

            try {
                resp = await resp.json()
            } catch (exc) {
                is_invalid_json = true
            }

            if (http_code !== 200) {
                fOnError(http_code, is_invalid_json)
            } else {
                if (is_invalid_json) {
                    fOnError(http_code, is_invalid_json)
                } else {
                    // JSON OK  &  # NETWORK SUCCESS

                    const is_valid_resp_sign = (typeof resp.result === 'string' && resp.result.length > 0)

                    if (is_valid_resp_sign) {
                        if (resp.result === sign) {
                            if (!is_sended) {
                                stat.sended++
                                is_sended = true
                            }

                            //logTime(`~~~~~~ ~~~~~~ Success send transaction. ${sign}   URL: ${url}`)
                        } else {
                            errlogTime(`Not comp signs. Planed: ${sign}. Real: ${resp.result}. URL: ${url}.`)
                        }
                    } else {
                        if ('error' in resp && 'message' in resp.error) {
                            fOnError(http_code, false)
                            // справочный код if (resp.error.message.indexOf('Transaction simulation failed:') === 0){}
                        } else {
                            fOnError(http_code, false)
                            // справочный код if (typeof resp === 'object') {JSON.stringify(resp)} else {resp}
                        }
                    }
                }
            }
        }).catch((err) => {
            // если случилось исключение, то не будет даже http кода.
            // Если сервак хоть что-то отвечает - выполнится then, а не catch
            fOnError(null, false)
        })
    }

    setTimeout(fSendTransaction.bind(this), sett.ms_minimal_inter_send_transaction)
}

fUpdateBlockhash()
fGetSlot()

heatUrls(sett.send_transaction_urls)
log('URLs heated.')

setInterval(() => {
    heatUrls(sett.send_transaction_urls)
    //logTime('URLs heated.')
}, sett.ms_inter_heat_urls)

setTimeout(fSendTransaction.bind(this), sett.ms_inter_send_first_transaction)

log('Owner: ' + owner_addr)
log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')

Geysers.init(owner_addr, (tr) => {
    if (tr.sign in mySigns) {
        const time = tr.ts_grpc - mySigns[tr.sign].ts_pre_send

        stat.listed++
        stat.ms_sum += time
        const avg = stat.ms_sum / stat.listed

        if (time < stat.min) stat.min = time
        if (time > stat.max) stat.max = time

        logTime(`~~~~~~ ~~~~~~ ~~~~~~ Geyser OK `, time, ` ms. ${tr.sign}`)

        if (stat.listed % 3 === 0) {
            log(
                `Время=[ПЕРЕД_ОТПРАВКОЙ<->ГЕЙЗЕР]`,
                `(min ${stat.min} ` +
                `max ${stat.max} ` +
                `avg ${Math.round(avg)} ` +
                `attempt_send ${stat.attempt_send} ` +
                `sended ${stat.sended} ` +
                `listed ${stat.listed}`
            )
        }
    }
})

setInterval(() => {
    Geysers.elems.forEach(geyser => {
        const work_time = Time.generate(Date.now() - ts_start)

        log(
            Time.getTime(),
            `Geyser #${geyser.id} ${geyser.url}.`,
            `Max slot: ${geyser.max_slot}.`,
            `Num onData: ${geyser.stat.on_data}.`,
            `Софт работает: ${work_time}.`
        )
    })
}, sett.ms_inter_geysers_stat)
