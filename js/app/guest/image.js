import { progress } from './progress.js';
import { cache } from '../../connection/cache.js';

export const image = (() => {

    /**
     * @type {NodeListOf<HTMLImageElement>|null}
     */
    let images = null;

    /**
     * @type {ReturnType<typeof cache>|null}
     */
    let c = null;

    /**
     * @type {IntersectionObserver|null}
     */
    let lazyObserver = null;

    /**
     * @type {object[]}
     */
    const urlCache = [];

    /**
     * @param {HTMLImageElement} el
     * @returns {boolean}
     */
    const shouldTrackProgress = (el) => {
        if (!el) {
            return false;
        }

        return Boolean(
            el.hasAttribute('fetchpriority') ||
            el.closest('#loading') ||
            el.closest('#welcome') ||
            el.id === 'show-modal-image'
        );
    };

    /**
     * @param {HTMLImageElement} el
     * @returns {boolean}
     */
    const shouldLazyLoad = (el) => {
        if (!el?.getAttribute('data-src')) {
            return false;
        }

        const src = el.getAttribute('src');
        const dataSrc = el.getAttribute('data-src');

        return Boolean(src !== dataSrc && !shouldTrackProgress(el));
    };

    /**
     * @param {string} src 
     * @returns {Promise<HTMLImageElement>}
     */
    const loadedImage = (src) => new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
    });

    /**
     * @param {HTMLImageElement} el 
     * @param {string} src 
     * @returns {Promise<void>}
     */
    const appendImage = (el, src) => loadedImage(src).then((img) => {
        el.width = img.naturalWidth;
        el.height = img.naturalHeight;
        el.classList.remove('opacity-0');
        el.src = img.src;
        img.remove();

        progress.complete('image', false, shouldTrackProgress(el));
    }).catch((err) => {
        const fallbackSrc = el.getAttribute('data-src') || el.src;
        if (fallbackSrc && fallbackSrc !== el.src) {
            el.src = fallbackSrc;
            el.classList.remove('opacity-0');
        }
        console.error(err);
        progress.invalid('image', shouldTrackProgress(el));
    });

    /**
     * @param {HTMLImageElement} el 
     * @returns {void}
     */
    const getByFetch = (el) => {
        const track = shouldTrackProgress(el);
        const src = el.getAttribute('data-src');

        if (!src) {
            return;
        }

        if (el.getAttribute('src') === src) {
            return;
        }

        if (el.src !== src) {
            el.src = src;
            el.classList.remove('opacity-0');
        }

        urlCache.push({
            url: src,
            res: (url) => appendImage(el, url),
            rej: (err) => {
                console.error(err);
                if (el.src !== src) {
                    el.src = src;
                    el.classList.remove('opacity-0');
                }
                progress.invalid('image', track);
            },
        });
    };

    /**
     * @param {HTMLImageElement} el 
     * @returns {void}
     */
    const getByDefault = (el) => {
        const track = shouldTrackProgress(el);

        el.onerror = () => progress.invalid('image', track);
        el.onload = () => {
            el.width = el.naturalWidth;
            el.height = el.naturalHeight;
            progress.complete('image', false, track);
        };

        if (el.complete && el.naturalWidth !== 0 && el.naturalHeight !== 0) {
            progress.complete('image', false, track);
        } else if (el.complete) {
            progress.invalid('image', track);
        }
    };

    /**
     * @returns {boolean}
     */
    const hasDataSrc = () => Array.from(images).some((i) => i.hasAttribute('data-src'));

    /**
     * @param {HTMLImageElement[]} imgs
     * @returns {void}
     */
    const observeLazyImages = (imgs = []) => {
        if (!imgs.length) {
            return;
        }

        const loadVisible = () => {
            const visible = imgs.filter((el) => {
                if (!el.isConnected || !el.getAttribute('data-src')) {
                    return false;
                }

                const rect = el.getBoundingClientRect();
                return rect.top < window.innerHeight + 240 && rect.bottom > -240 && rect.left < window.innerWidth + 240 && rect.right > -240;
            });

            visible.forEach((el) => {
                if (!el.dataset.loaded) {
                    el.dataset.loaded = 'true';
                    getByFetch(el);
                }
            });
        };

        imgs.forEach((el) => {
            el.loading = 'lazy';
            if (el.getAttribute('data-src') && !el.dataset.loaded) {
                const rect = el.getBoundingClientRect();
                if (rect.top < window.innerHeight + 240 && rect.bottom > -240 && rect.left < window.innerWidth + 240 && rect.right > -240) {
                    el.dataset.loaded = 'true';
                    getByFetch(el);
                }
            }
        });

        if (typeof IntersectionObserver === 'undefined') {
            loadVisible();
            return;
        }

        lazyObserver?.disconnect();
        lazyObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                const el = entry.target;
                observer.unobserve(el);
                if (el.getAttribute('data-src') && !el.dataset.loaded) {
                    el.dataset.loaded = 'true';
                    getByFetch(el);
                }
            });
        }, {
            rootMargin: '200px 0px',
            threshold: 0.05,
        });

        imgs.forEach((el) => lazyObserver.observe(el));
    };

    /**
     * @returns {Promise<void>}
     */
    const load = async () => {
        const imgs = Array.from(images || []);
        const tracked = imgs.filter((el) => shouldTrackProgress(el));

        /**
         * @param {function} filter 
         * @returns {Promise<void>}
         */
        const runGroup = async (filter) => {
            urlCache.length = 0;
            imgs.filter(filter).forEach((el) => el.hasAttribute('data-src') ? getByFetch(el) : getByDefault(el));
            await c.run(urlCache, progress.getAbort());
        };

        await runGroup((el) => shouldTrackProgress(el));

        if (tracked.length === 0) {
            observeLazyImages(imgs.filter((el) => shouldLazyLoad(el)));
        } else {
            observeLazyImages(imgs.filter((el) => shouldLazyLoad(el) && !tracked.includes(el)));
        }
    };

    /**
     * @param {string} blobUrl 
     * @returns {void}
     */
    const download = (blobUrl) => {
        c.download(blobUrl, `${window.location.hostname}_image_${Date.now()}`);
    };

    /**
     * @returns {object}
     */
    const init = () => {
        c = cache('image').withForceCache();
        images = document.querySelectorAll('img');
        Array.from(images)
            .filter((el) => shouldTrackProgress(el))
            .forEach(progress.add);

        Array.from(images).forEach((el) => {
            if (shouldLazyLoad(el)) {
                el.loading = 'lazy';
            }
        });

        return {
            load,
            download,
            hasDataSrc,
        };
    };

    return {
        init,
    };
})();