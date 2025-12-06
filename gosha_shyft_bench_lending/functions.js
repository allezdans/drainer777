const Time = require('./Time')
const {Transaction, SystemProgram} = require("@solana/web3.js");
const bs58 = require("bs58").default


module.exports = {
    logTime: (...args) => {
        log(Time.getTime(), ...args)
    },

    errlogTime: (...args) => {
        errlog(Time.getTime(), ...args)
    },

    // не тестировал
    heatUrls: (urls) => {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i]

            try{
                fetch(url, {keepalive: true,redirect: 'manual',method: 'HEAD'})
                    .then(()=>{})
                    .catch(()=>{})
            }catch(exc){}
        }
    },

    generateTransaction: (blockhash, owner, sol_lamports_transfer_for_unique) => {
        const tr = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: owner.publicKey,
                toPubkey: owner.publicKey,
                lamports: sol_lamports_transfer_for_unique
            })
        )

        tr.recentBlockhash = blockhash
        tr.sign(...[owner])//подписали

        const base64_serialized = tr.serialize().toString('base64')
        const sign = bs58.encode(tr.signature)

        return {sign, base64_serialized}
    },

    getFetchRequestOptionsForSendTransaction: (base64_serialized, is_skip_preflight = false) => {
        return {
            method: "POST",
            keepalive: true,
            headers: {"Content-Type": "application/json",},
            body: JSON.stringify({
                id: Date.now().toString(),
                jsonrpc: "2.0",
                method: 'sendTransaction',
                params: [base64_serialized, {encoding: 'base64', skipPreflight: is_skip_preflight, preflightCommitment: 'processed'}],
            })
        }
    },
}