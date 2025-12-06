const That = module.exports = class {
    static generate(ms, is_hide_ms = false) {
        const a = That.#bcMod(ms, 1000)
        const full_sec = a[0]
        const ms2 = That.#add0TenOrHundred(a[1], true)

        const b = That.#bcMod(full_sec, 3600)
        const hours = b[0]
        const ost_sec = b[1]

        const c = That.#bcMod(ost_sec, 60)
        const min = That.#add0TenOrHundred(c[0])
        const sec = That.#add0TenOrHundred(c[1])

        const ms_data = (is_hide_ms ? '' : '.' + ms2 + '')

        return `${hours}:${min}:${sec}${ms_data}`
    }

    static getTime(ms_or_obj = null, is_hide_ms = false) {
        let date

        if (ms_or_obj === null) {
            date = new Date(Date.now())
        } else if (typeof ms_or_obj === 'object') {
            date = ms_or_obj
        } else {
            date = new Date(+ms_or_obj)
        }

        const hours = That.#add0TenOrHundred(date.getHours())
        const min = That.#add0TenOrHundred(date.getMinutes())
        const sec = That.#add0TenOrHundred(date.getSeconds())
        const ms = That.#add0TenOrHundred(date.getMilliseconds(), true)

        const ms_data = (is_hide_ms ? '' : '.' + ms + '')

        return `${hours}:${min}:${sec}${ms_data}`
    }

    static #add0TenOrHundred(int, is_hundred = false) {
        if (is_hundred) {
            if (int < 10) {
                return ('00' + int)
            } else if (int < 100) {
                return ('0' + int)
            }
        } else {
            if (int < 10) {
                return ('0' + int)
            }
        }

        return int
    }

    static #bcMod(a, b) {
        const c = Math.floor(Number((a/b).toFixed(12)))// compensation 754
        const d = Math.floor(Number((c*b).toFixed(12)))
        const e = Math.floor(Number((a-d).toFixed(12)))

        return [c, e]
    }
}
