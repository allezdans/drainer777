

const That = module.exports = class Geysers {
    static elems = []
    static max_slot = null
    static cb_on_fresh_transaction = null
    static is_inited = false

    static connectData = [
        {url: 'https://grpc.fra.shyft.to', apikey: 'СЮДА'},
        {url: 'https://grpc.fra.shyft.to', apikey: 'СЮДА'},
        {url: 'https://grpc.fra.shyft.to', apikey: 'СЮДА'},
        {url: 'https://rabbitstream.fra.shyft.to', apikey: 'СЮДА'},
        {url: 'https://rabbitstream.fra.shyft.to', apikey: 'СЮДА'},
        {url: 'https://rabbitstream.fra.shyft.to', apikey: 'СЮДА'},
        {url: 'https://solana-yellowstone-grpc.publicnode.com:443', apikey: null},
        {url: 'https://solana-yellowstone-grpc.publicnode.com:443', apikey: null},
    ]

    static trs = {
        assoc: {},
        arr: []
    }

    static init(owner_addr = null, cb_on_fresh_transaction = null) {
        if (That.is_inited) return
        That.is_inited = true

        const Geyser = require("./Geyser")

        That.cb_on_fresh_transaction = cb_on_fresh_transaction
        
        That.connectData.forEach(struct => {
            const id = That.elems.length
            const geyser = new Geyser(id, struct.url, struct.apikey, owner_addr)
            That.elems.push(geyser)

            log(`Play geyser #${id}...`, struct.url)

            geyser.playOrStopOrRestart(true)
        })
    }

    static push(tr) {
        That.trs.assoc[tr.sign] = tr
        That.trs.arr.push(tr)

        if (That.cb_on_fresh_transaction !== null) {
            That.cb_on_fresh_transaction(tr)
        }
    }
}
