export const progress = (() => {

    /**
     * @type {HTMLElement|null}
     */
    let info = null;

    /**
     * @type {HTMLElement|null}
     */
    let bar = null;

    let total = 0;
    let loaded = 0;
    let valid = true;
    let fallbackTimer = null;

    /**
     * @type {Promise<void>|null}
     */
    let cancelProgress = null;

    /**
     * @returns {void}
     */
    const fireDone = () => {
        if (!valid) {
            return;
        }

        valid = false;
        cancelProgress = null;
        clearTimeout(fallbackTimer);
        document.dispatchEvent(new Event('undangan.progress.done'));
    };

    /**
     * @returns {void}
     */
    const add = () => {
        total += 1;
    };

    /**
     * @returns {string}
     */
    const showInformation = () => {
        if (total <= 0) {
            return '(ready)';
        }

        return `(${loaded}/${total}) [${parseInt((loaded / total) * 100).toFixed(0)}%]`;
    };

    /**
     * @param {string} type
     * @param {boolean} [skip=false]
     * @param {boolean} [count=true]
     * @returns {void}
     */
    const complete = (type, skip = false, count = true) => {
        if (!valid || !count) {
            return;
        }

        loaded += 1;
        info.innerText = `Loading ${type} ${skip ? 'skipped' : 'complete'} ${showInformation()}`;
        bar.style.width = Math.min((loaded / total) * 100, 100).toString() + '%';

        if (loaded >= total || total === 0) {
            fireDone();
        }
    };

    /**
     * @param {string} type
     * @param {boolean} [count=true]
     * @returns {void}
     */
    const invalid = (type, count = true) => {
        if (!valid || !count) {
            return;
        }

        valid = false;
        bar.style.backgroundColor = 'red';
        info.innerText = `Error loading ${type} ${showInformation()}`;
        document.dispatchEvent(new Event('undangan.progress.invalid'));
    };

    /**
     * @returns {Promise<void>|null}
     */
    const getAbort = () => cancelProgress;

    /**
     * @returns {void}
     */
    const init = () => {
        info = document.getElementById('progress-info');
        bar = document.getElementById('progress-bar');
        info.classList.remove('d-none');
        cancelProgress = new Promise((res) => document.addEventListener('undangan.progress.invalid', res));

        if (fallbackTimer) {
            clearTimeout(fallbackTimer);
        }

        fallbackTimer = window.setTimeout(() => {
            if (!valid) {
                return;
            }

            if (total > 0) {
                const percentage = Math.min(100, (loaded / total) * 100);
                bar.style.width = `${percentage}%`;
                info.innerText = `Loading application complete ${showInformation()}`;
            }

            fireDone();
        }, 2200);
    };

    return {
        init,
        add,
        invalid,
        complete,
        getAbort,
    };
});