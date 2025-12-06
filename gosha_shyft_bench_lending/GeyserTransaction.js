module.exports = class GeyserTransaction {
    sign = null
    raw = null // выключено чтоб память не жрало
    ts_grpc = null
    tsp_grpc = null
    source = null

    constructor(sign, raw, tspGrpc, source) {
        this.ts_grpc = tspGrpc.ts
        this.tsp_grpc = tspGrpc.tsp
        this.sign = sign
        this.source = source

        // выключено чтоб память не жрало
        //this.raw = raw
    }
}