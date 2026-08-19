import { storage } from '../../common/storage.js';
import { tapTapAnimation } from '../../libs/confetti.js';
import { supabase } from '../../../supabase/client.js';


export const like = (() => {

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let likes = null;

    /**
     * @type {Map<string, AbortController>|null}
     */
    let listeners = null;


    /**
     * Membuat ID visitor yang tetap untuk browser ini.
     *
     * @returns {string}
     */
    const getVisitorId = () => {

        const key = 'supabase_like_visitor_id';

        let id = localStorage.getItem(key);

        if (!id) {
            id =
                crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2)}`;

            localStorage.setItem(key, id);
        }

        return id;
    };


    /**
     * @param {HTMLButtonElement} button
     * @returns {Promise<void>}
     */
    const love = async (button) => {

        if (!button) {
            return;
        }

        const info = button.firstElementChild;
        const heart = button.lastElementChild;

        const id =
            button.getAttribute('data-uuid');

        if (!id || !info || !heart) {
            return;
        }

        const count =
            parseInt(
                info.getAttribute(
                    'data-count-like'
                ) ?? '0'
            );

        button.disabled = true;

        if (navigator.vibrate) {
            navigator.vibrate(100);
        }

        const visitorId =
            getVisitorId();

        try {

            /*
             * =========================================
             * UNLIKE
             * =========================================
             */

            if (likes.has(id)) {

                const { error } =
                    await supabase
                        .from('comment_likes')
                        .delete()
                        .eq(
                            'comment_id',
                            id
                        )
                        .eq(
                            'visitor_id',
                            visitorId
                        );

                if (error) {
                    throw error;
                }

                likes.unset(id);

                heart.classList.remove(
                    'fa-solid',
                    'text-danger'
                );

                heart.classList.add(
                    'fa-regular'
                );

                info.setAttribute(
                    'data-count-like',
                    String(
                        Math.max(
                            0,
                            count - 1
                        )
                    )
                );

                info.innerText =
                    info.getAttribute(
                        'data-count-like'
                    );

                return;
            }


            /*
             * =========================================
             * LIKE
             * =========================================
             */

            const { error } =
                await supabase
                    .from('comment_likes')
                    .insert({
                        comment_id: id,
                        visitor_id: visitorId,
                    });

            /*
             * Kalau sudah pernah like tetapi
             * localStorage belum tahu, anggap
             * sebagai already liked.
             */
            if (error) {

                if (
                    error.code === '23505'
                ) {

                    likes.set(
                        id,
                        id
                    );

                    heart.classList.remove(
                        'fa-regular'
                    );

                    heart.classList.add(
                        'fa-solid',
                        'text-danger'
                    );

                    info.innerText =
                        info.getAttribute(
                            'data-count-like'
                        );

                    return;
                }

                throw error;
            }

            likes.set(
                id,
                id
            );

            heart.classList.remove(
                'fa-regular'
            );

            heart.classList.add(
                'fa-solid',
                'text-danger'
            );

            info.setAttribute(
                'data-count-like',
                String(
                    count + 1
                )
            );

            info.innerText =
                info.getAttribute(
                    'data-count-like'
                );

        } catch (error) {

            console.error(
                'Supabase like error:',
                error
            );

        } finally {

            button.disabled = false;
        }
    };


    /**
     * @param {string} uuid
     * @returns {HTMLElement|null}
     */
    const getButtonLike = (uuid) => {
        return document.querySelector(
            `button[onclick="undangan.comment.like.love(this)"][data-uuid="${uuid}"]`
        );
    };


    /**
     * @param {HTMLElement} div
     * @returns {Promise<void>}
     */
    const tapTap = async (div) => {

        if (!navigator.onLine || !div) {
            return;
        }

        const currentTime =
            Date.now();

        const tapLength =
            currentTime -
            parseInt(
                div.getAttribute(
                    'data-tapTime'
                ) ?? '0'
            );

        const uuid =
            div.id.replace(
                'body-content-',
                ''
            );

        const isTapTap =
            tapLength < 300 &&
            tapLength > 0;

        const notLiked =
            !likes.has(uuid) &&
            div.getAttribute(
                'data-liked'
            ) !== 'true';

        if (
            isTapTap &&
            notLiked
        ) {

            tapTapAnimation(div);

            div.setAttribute(
                'data-liked',
                'true'
            );

            const button =
                getButtonLike(uuid);

            if (button) {
                await love(button);
            }

            div.setAttribute(
                'data-liked',
                'false'
            );
        }

        div.setAttribute(
            'data-tapTime',
            String(currentTime)
        );
    };


    /**
     * @param {string} uuid
     * @returns {void}
     */
    const addListener = (uuid) => {

        const bodyLike =
            document.getElementById(
                `body-content-${uuid}`
            );

        if (!bodyLike) {
            return;
        }

        removeListener(uuid);

        const ac =
            new AbortController();

        bodyLike.addEventListener(
            'touchend',
            () => tapTap(bodyLike),
            {
                signal: ac.signal
            }
        );

        listeners.set(
            uuid,
            ac
        );
    };


    /**
     * @param {string} uuid
     * @returns {void}
     */
    const removeListener = (uuid) => {

        const ac =
            listeners?.get(uuid);

        if (ac) {
            ac.abort();
            listeners.delete(uuid);
        }
    };


    /**
     * Sinkronisasi status like
     * dari Supabase untuk komentar yang sedang tampil.
     *
     * @param {string[]} ids
     * @returns {Promise<void>}
     */
    const syncLikes = async (ids) => {

        if (!ids?.length) {
            return;
        }

        const visitorId =
            getVisitorId();

        const {
            data,
            error
        } = await supabase
            .from('comment_likes')
            .select(
                'comment_id'
            )
            .in(
                'comment_id',
                ids
            )
            .eq(
                'visitor_id',
                visitorId
            );

        if (error) {
            console.error(
                'Supabase like sync error:',
                error
            );

            return;
        }

        for (const item of data ?? []) {

            likes.set(
                item.comment_id,
                item.comment_id
            );

            const button =
                getButtonLike(
                    item.comment_id
                );

            if (!button) {
                continue;
            }

            const heart =
                button.lastElementChild;

            if (heart) {
                heart.classList.remove(
                    'fa-regular'
                );

                heart.classList.add(
                    'fa-solid',
                    'text-danger'
                );
            }
        }
    };


    /**
     * @returns {void}
     */
    const init = () => {

        listeners =
            new Map();

        likes =
            storage('likes');

        if (
            !localStorage.getItem(
                'supabase_like_visitor_id'
            )
        ) {
            getVisitorId();
        }
    };


    return {
        init,
        love,
        getButtonLike,
        addListener,
        removeListener,
        syncLikes,
    };

})();