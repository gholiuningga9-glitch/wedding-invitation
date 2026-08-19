import { gif } from './gif.js';
import { card } from './card.js';
import { like } from './like.js';
import { util } from '../../common/util.js';
import { pagination } from './pagination.js';
import { dto } from '../../connection/dto.js';
import { lang } from '../../common/language.js';
import { storage } from '../../common/storage.js';
import { session } from '../../common/session.js';
import { supabase, invitation } from '../../../supabase/client.js';


export const comment = (() => {

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let owns = null;

    /**
     * @type {ReturnType<typeof storage>|null}
     */
    let showHide = null;

    /**
     * @type {HTMLElement|null}
     */
    let comments = null;

    /**
     * @type {string[]}
     */
    const lastRender = [];


    /**
     * @returns {string}
     */
    const onNullComment = () => {
        const desc = lang
            .on('id', '📢 Yuk, share undangan ini biar makin rame komentarnya! 🎉')
            .on('en', '📢 Let\'s share this invitation to get more comments! 🎉')
            .get();

        return `
            <div class="text-center p-4 mx-0 mt-0 mb-3 bg-theme-auto rounded-4 shadow">
                <p class="fw-bold p-0 m-0" style="font-size: 0.95rem;">
                    ${desc}
                </p>
            </div>
        `;
    };


    /**
     * @param {string} id
     * @param {boolean} disabled
     * @returns {void}
     */
    const changeActionButton = (id, disabled) => {
        document
            .querySelectorAll(`[data-button-action="${id}"] button, [data-button-action="${id}"]`)
            .forEach((e) => {
                e.disabled = disabled;
            });
    };


    /**
     * @param {string} id
     * @returns {void}
     */
    const removeInnerForm = (id) => {
        changeActionButton(id, false);

        const element = document.getElementById(`inner-${id}`);

        if (element) {
            element.remove();
        }
    };


    /**
     * @param {HTMLButtonElement} button
     * @returns {void}
     */
    const showOrHide = (button) => {
        const ids = button.getAttribute('data-uuids')?.split(',') ?? [];
        const isShow = button.getAttribute('data-show') === 'true';
        const uuid = button.getAttribute('data-uuid');
        const currentShow = showHide.get('show');

        button.setAttribute('data-show', isShow ? 'false' : 'true');
        button.innerText = isShow
            ? `Show replies (${ids.length})`
            : 'Hide replies';

        showHide.set(
            'show',
            isShow
                ? currentShow.filter((i) => i !== uuid)
                : [...currentShow, uuid]
        );

        for (const id of ids) {
            const hidden = showHide.get('hidden').map((i) => {
                if (i.uuid === id) {
                    i.show = !isShow;
                }

                return i;
            });

            showHide.set('hidden', hidden);

            document
                .getElementById(id)
                ?.classList.toggle('d-none', isShow);
        }
    };


    /**
     * @param {HTMLAnchorElement} anchor
     * @param {string} uuid
     * @returns {void}
     */
    const showMore = (anchor, uuid) => {
        const content = document.getElementById(`content-${uuid}`);

        if (!content) {
            return;
        }

        const original = util.base64Decode(
            content.getAttribute('data-comment')
        );

        const isCollapsed =
            anchor.getAttribute('data-show') === 'false';

        util.safeInnerHTML(
            content,
            util.convertMarkdownToHTML(
                util.escapeHtml(
                    isCollapsed
                        ? original
                        : original.slice(0, card.maxCommentLength) + '...'
                )
            )
        );

        anchor.innerText = isCollapsed
            ? 'Sebagian'
            : 'Selengkapnya';

        anchor.setAttribute(
            'data-show',
            isCollapsed ? 'true' : 'false'
        );
    };


    /**
     * Build tree hierarchy dari flat rows Supabase.
     *
     * @param {Array} data
     * @param {string|null} parentId
     * @returns {Array}
     */
    const buildTree = (data, parentId = null) => {
        return data
            .filter((item) => item.parent_id === parentId)
            .map((item) => ({
                uuid: item.id,
                own: item.id,
                name: item.name,
                presence: item.presence,
                comment: item.comment,
                created_at: item.created_at,
                is_admin: item.is_admin ?? false,
                is_parent: parentId === null,
                gif_url: item.gif_url ?? null,
                ip: null,
                user_agent: null,
                comments: buildTree(data, item.id),
                like_count: 0,
            }));
    };


    /**
     * @returns {Promise<object|null>}
     */
    const getCurrentInvitation = async () => {
        try {
            const currentInvitation = await invitation;

            if (!currentInvitation?.id) {
                console.error('Invitation tidak ditemukan.');
                return null;
            }

            return currentInvitation;
        } catch (error) {
            console.error(
                'Gagal mengambil invitation:',
                error
            );

            return null;
        }
    };


    /**
     * @returns {Promise<void>}
     */
    const show = async () => {

        // Lepas listener lama
        lastRender.forEach((uuid) => {
            like.removeListener(uuid);
        });

        lastRender.splice(0, lastRender.length);

        if (comments.getAttribute('data-loading') === 'false') {
            comments.setAttribute('data-loading', 'true');
            comments.innerHTML =
                card.renderLoading().repeat(
                    pagination.getPer()
                );
        }

        const currentInvitation =
            await getCurrentInvitation();

        if (!currentInvitation) {
            comments.setAttribute(
                'data-loading',
                'false'
            );

            comments.innerHTML = onNullComment();
            return;
        }

        const {
            data,
            error
        } = await supabase
            .from('comments')
            .select(`
                id,
                invitation_id,
                parent_id,
                name,
                presence,
                comment,
                gif_id,
                gif_url,
                created_at,
                is_admin
            `)
            .eq(
                'invitation_id',
                currentInvitation.id
            )
            .order(
                'created_at',
                {
                    ascending: true
                }
            );

        comments.setAttribute(
            'data-loading',
            'false'
        );

        if (error) {
            console.error(
                'Supabase comment fetch error:',
                error
            );

            comments.innerHTML =
                onNullComment();

            return;
        }

        if (!data || data.length === 0) {
            comments.innerHTML =
                onNullComment();

            pagination.setTotal(0);

            return;
        }

        const lists = buildTree(data);

        if (!lists.length) {
            comments.innerHTML =
                onNullComment();

            pagination.setTotal(0);

            return;
        }

        const flatten = (items) =>
            items.flatMap((item) => [
                item.uuid,
                ...flatten(item.comments)
            ]);

        lastRender.splice(
            0,
            lastRender.length,
            ...flatten(lists)
        );

        showHide.set(
            'hidden',
            traverse(
                lists,
                showHide.get('hidden')
            )
        );

        const html =
            await card.renderContentMany(
                lists
            );

        comments.innerHTML = html;

        lastRender.forEach((uuid) => {
            like.addListener(uuid);
        });

        await like.syncLikes(lastRender);

        pagination.setTotal(
            lists.length
        );

        comments.dispatchEvent(
            new Event(
                'undangan.comment.done'
            )
        );
    };


    /**
     * @param {HTMLButtonElement} button
     * @returns {Promise<void>}
     */
    const remove = async (button) => {

        if (!util.ask('Are you sure?')) {
            return;
        }

        const id =
            button.getAttribute('data-uuid');

        if (!id) {
            return;
        }

        changeActionButton(id, true);

        const btn =
            util.disableButton(button);

        try {

            const {
                error
            } = await supabase
                .from('comments')
                .delete()
                .eq('id', id);

            if (error) {
                console.error(
                    'Supabase delete error:',
                    error
                );

                util.notify(
                    'Gagal menghapus ucapan.'
                ).warning();

                btn.restore();
                changeActionButton(
                    id,
                    false
                );

                return;
            }

            owns?.unset(id);

            document
                .getElementById(id)
                ?.remove();

            if (
                comments.children.length === 0
            ) {
                comments.innerHTML =
                    onNullComment();
            }

        } catch (error) {

            console.error(
                'Delete comment error:',
                error
            );

            util.notify(
                'Gagal menghapus ucapan.'
            ).warning();

        } finally {

            btn.restore();

            changeActionButton(
                id,
                false
            );
        }
    };


    /**
     * @param {HTMLButtonElement} button
     * @returns {Promise<void>}
     */
    const update = async (button) => {

        const id =
            button.getAttribute(
                'data-uuid'
            );

        if (!id) {
            return;
        }

        let isPresent = false;

        const presence =
            document.getElementById(
                `form-inner-presence-${id}`
            );

        if (presence) {
            presence.disabled = true;
            isPresent =
                presence.value === '1';
        }

        const badge =
            document.getElementById(
                `badge-${id}`
            );

        const isChecklist =
            !!badge &&
            badge.getAttribute(
                'data-is-presence'
            ) === 'true';

        const gifIsOpen =
            gif.isOpen(id);

        const gifId =
            gif.getResultId(id);

        const gifCancel =
            gif.buttonCancel(id);

        if (gifIsOpen && gifId) {
            gifCancel.hide();
        }

        const form =
            document.getElementById(
                `form-inner-${id}`
            );

        if (!form) {
            return;
        }

        if (
            !gifIsOpen &&
            util.base64Encode(form.value) ===
                form.getAttribute(
                    'data-original'
                ) &&
            isChecklist === isPresent
        ) {
            removeInnerForm(id);
            return;
        }

        if (
            !gifIsOpen &&
            form.value?.trim().length === 0
        ) {
            util.notify(
                'Comments cannot be empty.'
            ).warning();

            return;
        }

        form.disabled = true;

        const btn =
            util.disableButton(button);

        try {

            const {
                error
            } = await supabase
                .from('comments')
                .update({
                    presence:
                        presence
                            ? isPresent
                            : null,
                    comment:
                        gifIsOpen
                            ? null
                            : form.value,
                    gif_id:
                        gifId || null,
                })
                .eq('id', id);

            if (error) {
                console.error(
                    'Supabase update error:',
                    error
                );

                util.notify(
                    'Gagal memperbarui ucapan.'
                ).warning();

                return;
            }

            removeInnerForm(id);

            if (!gifIsOpen) {

                const showButton =
                    document.querySelector(
                        `[onclick="undangan.comment.showMore(this, '${id}')"]`
                    );

                const content =
                    document.getElementById(
                        `content-${id}`
                    );

                if (content) {

                    content.setAttribute(
                        'data-comment',
                        util.base64Encode(
                            form.value
                        )
                    );

                    const original =
                        util.convertMarkdownToHTML(
                            util.escapeHtml(
                                form.value
                            )
                        );

                    if (
                        form.value.length >
                        card.maxCommentLength
                    ) {

                        util.safeInnerHTML(
                            content,
                            showButton?.getAttribute(
                                'data-show'
                            ) === 'false'
                                ? original.slice(
                                    0,
                                    card.maxCommentLength
                                ) + '...'
                                : original
                        );

                        showButton?.classList
                            .replace(
                                'd-none',
                                'd-block'
                            );

                    } else {

                        util.safeInnerHTML(
                            content,
                            original
                        );

                        showButton?.classList
                            .replace(
                                'd-block',
                                'd-none'
                            );
                    }
                }
            }

            if (presence) {
                document.getElementById(
                    'form-presence'
                ).value =
                    isPresent
                        ? '1'
                        : '2';

                storage(
                    'information'
                ).set(
                    'presence',
                    isPresent
                );
            }

            if (
                gifIsOpen &&
                gifId
            ) {
                const gifImage =
                    document.getElementById(
                        `img-gif-${id}`
                    );

                const gifResult =
                    document.getElementById(
                        `gif-result-${id}`
                    );

                if (gifImage && gifResult) {
                    const image =
                        gifResult.querySelector(
                            'img'
                        );

                    if (image) {
                        gifImage.src =
                            image.src;
                    }
                }

                gifCancel.click();
            }

        } catch (error) {

            console.error(
                'Update comment error:',
                error
            );

            util.notify(
                'Gagal memperbarui ucapan.'
            ).warning();

        } finally {

            form.disabled = false;

            if (presence) {
                presence.disabled = false;
            }

            btn.restore();

            if (
                gifIsOpen &&
                gifId
            ) {
                gifCancel.show();
            }
        }
    };


    /**
     * @param {HTMLButtonElement} button
     * @returns {Promise<void>}
     */
    const send = async (button) => {

        const id =
            button.getAttribute('data-uuid');

        const name =
            document.getElementById(
                'form-name'
            );

        const nameValue =
            name?.value?.trim() ?? '';

        if (nameValue.length === 0) {

            util.notify(
                'Name cannot be empty.'
            ).warning();

            if (id && name) {
                name.scrollIntoView({
                    block: 'center'
                });
            }

            return;
        }

        const presence =
            document.getElementById(
                'form-presence'
            );

        if (
            !id &&
            presence &&
            presence.value === '0'
        ) {

            util.notify(
                'Please select your attendance status.'
            ).warning();

            return;
        }

        const gifIsOpen =
            gif.isOpen(
                id
                    ? id
                    : gif.default
            );

        const gifId =
            gif.getResultId(
                id
                    ? id
                    : gif.default
            );

        const gifCancel =
            gif.buttonCancel(id);

        if (
            gifIsOpen &&
            !gifId
        ) {

            util.notify(
                'Gif cannot be empty.'
            ).warning();

            return;
        }

        if (
            gifIsOpen &&
            gifId
        ) {
            gifCancel.hide();
        }

        const form =
            document.getElementById(
                `form-${
                    id
                        ? `inner-${id}`
                        : 'comment'
                }`
            );

        if (
            !form
        ) {
            return;
        }

        if (
            !gifIsOpen &&
            form.value?.trim().length === 0
        ) {

            util.notify(
                'Comments cannot be empty.'
            ).warning();

            return;
        }

        if (
            !id &&
            name &&
            !session.isAdmin()
        ) {
            name.disabled = true;
        }

        if (
            !session.isAdmin() &&
            presence &&
            presence.value !== '0'
        ) {
            presence.disabled = true;
        }

        form.disabled = true;

        const cancel =
            document.querySelector(
                `[onclick="undangan.comment.cancel(this, '${id}')"]`
            );

        if (cancel) {
            cancel.disabled = true;
        }

        const btn =
            util.disableButton(button);

        const isPresence =
            presence
                ? presence.value === '1'
                : true;

        if (!session.isAdmin()) {

            const info =
                storage(
                    'information'
                );

            info.set(
                'name',
                nameValue
            );

            if (!id) {
                info.set(
                    'presence',
                    isPresence
                );
            }
        }

        const currentInvitation =
            await getCurrentInvitation();

        if (!currentInvitation) {

            util.notify(
                'Undangan tidak ditemukan.'
            ).warning();

            btn.restore();
            form.disabled = false;

            if (presence) {
                presence.disabled = false;
            }

            if (name) {
                name.disabled = false;
            }

            return;
        }

        try {

            const {
                data,
                error
            } = await supabase
                .from('comments')
                .insert({
                    invitation_id:
                        currentInvitation.id,

                    parent_id:
                        id || null,

                    name:
                        nameValue,

                    presence:
                        isPresence,

                    comment:
                        gifIsOpen
                            ? null
                            : form.value,

                    gif_id:
                        gifId || null,
                })
                .select(`
                    id,
                    invitation_id,
                    parent_id,
                    name,
                    presence,
                    comment,
                    gif_id,
                    gif_url,
                    created_at,
                    is_admin
                `)
                .single();

            if (error) {

                console.error(
                    'Supabase insert error:',
                    error
                );

                util.notify(
                    'Gagal mengirim ucapan.'
                ).warning();

                return;
            }

            console.log(
                'Komentar berhasil disimpan:',
                data
            );

            form.value = '';

            if (gifIsOpen && gifId) {
                gifCancel.click();
            }

            // Refresh daftar komentar
            await show();

        } catch (error) {

            console.error(
                'Send comment error:',
                error
            );

            util.notify(
                'Gagal mengirim ucapan.'
            ).warning();

        } finally {

            if (name) {
                name.disabled = false;
            }

            if (form) {
                form.disabled = false;
            }

            if (cancel) {
                cancel.disabled = false;
            }

            if (presence) {
                presence.disabled = false;
            }

            if (gifIsOpen && gifId) {
                gifCancel.show();
            }

            btn.restore();
        }
    };


    /**
     * @param {HTMLButtonElement} button
     * @param {string} id
     * @returns {Promise<void>}
     */
    const cancel = async (button, id) => {

        const presence =
            document.getElementById(
                `form-inner-presence-${id}`
            );

        const isPresent =
            presence
                ? presence.value === '1'
                : false;

        const badge =
            document.getElementById(
                `badge-${id}`
            );

        const isChecklist =
            badge &&
            owns.has(id) &&
            presence
                ? badge.getAttribute(
                    'data-is-presence'
                ) === 'true'
                : false;

        const btn =
            util.disableButton(button);

        if (
            gif.isOpen(id) &&
            (
                (
                    !gif.getResultId(id) &&
                    isChecklist === isPresent
                ) ||
                util.ask('Are you sure?')
            )
        ) {

            await gif.remove(id);
            removeInnerForm(id);
            return;
        }

        const form =
            document.getElementById(
                `form-inner-${id}`
            );

        if (!form) {
            btn.restore();
            return;
        }

        if (
            form.value.length === 0 ||
            (
                util.base64Encode(
                    form.value
                ) ===
                form.getAttribute(
                    'data-original'
                ) &&
                isChecklist === isPresent
            ) ||
            util.ask('Are you sure?')
        ) {

            removeInnerForm(id);
            return;
        }

        btn.restore();
    };


    /**
     * @param {string} uuid
     * @returns {void}
     */
    const reply = (uuid) => {

        changeActionButton(
            uuid,
            true
        );

        gif.remove(uuid).then(() => {

            gif.onOpen(
                uuid,
                () => gif.removeGifSearch(uuid)
            );

            document
                .getElementById(
                    `button-${uuid}`
                )
                ?.insertAdjacentElement(
                    'afterend',
                    card.renderReply(uuid)
                );
        });
    };


    /**
     * @param {HTMLButtonElement} button
     * @param {boolean} is_parent
     * @returns {Promise<void>}
     */
    const edit = async (button, is_parent) => {

        const id =
            button.getAttribute(
                'data-uuid'
            );

        if (!id) {
            return;
        }

        changeActionButton(
            id,
            true
        );

        const badge =
            document.getElementById(
                `badge-${id}`
            );

        const isChecklist =
            !!badge &&
            badge.getAttribute(
                'data-is-presence'
            ) === 'true';

        const gifImage =
            document.getElementById(
                `img-gif-${id}`
            );

        if (gifImage) {
            await gif.remove(id);
        }

        const isParent =
            is_parent &&
            !session.isAdmin();

        document
            .getElementById(
                `button-${id}`
            )
            ?.insertAdjacentElement(
                'afterend',
                card.renderEdit(
                    id,
                    isChecklist,
                    isParent,
                    !!gifImage
                )
            );

        if (gifImage) {

            gif.onOpen(
                id,
                () => {
                    gif.removeGifSearch(id);
                    gif.removeButtonBack(id);
                }
            );

            await gif.open(id);
            return;
        }

        const formInner =
            document.getElementById(
                `form-inner-${id}`
            );

        const content =
            document.getElementById(
                `content-${id}`
            );

        const original =
            util.base64Decode(
                content?.getAttribute(
                    'data-comment'
                )
            );

        if (formInner) {
            formInner.value = original;
            formInner.setAttribute(
                'data-original',
                util.base64Encode(
                    original
                )
            );
        }
    };


    /**
     * @param {ReturnType<typeof dto.getCommentsResponse>} items
     * @param {ReturnType<typeof dto.commentShowMore>[]} hide
     * @returns {ReturnType<typeof dto.commentShowMore>[]}
     */
    const traverse = (
        items,
        hide = []
    ) => {

        const dataShow =
            showHide.get('show');

        const buildHide =
            (lists) =>
                lists.forEach((item) => {

                    if (
                        hide.find(
                            (i) =>
                                i.uuid === item.uuid
                        )
                    ) {

                        buildHide(
                            item.comments
                        );

                        return;
                    }

                    hide.push(
                        dto.commentShowMore(
                            item.uuid
                        )
                    );

                    buildHide(
                        item.comments
                    );
                });

        const setVisible =
            (lists) =>
                lists.forEach((item) => {

                    if (
                        !dataShow.includes(
                            item.uuid
                        )
                    ) {

                        setVisible(
                            item.comments
                        );

                        return;
                    }

                    item.comments.forEach(
                        (c) => {

                            const i =
                                hide.findIndex(
                                    (h) =>
                                        h.uuid === c.uuid
                                );

                            if (i !== -1) {
                                hide[i].show = true;
                            }
                        }
                    );

                    setVisible(
                        item.comments
                    );
                });

        buildHide(items);
        setVisible(items);

        return hide;
    };


    /**
     * @returns {void}
     */
    const init = () => {

        gif.init();
        like.init();
        card.init();
        pagination.init();

        comments =
            document.getElementById(
                'comments'
            );

        if (!comments) {
            return;
        }

        comments.addEventListener(
            'undangan.comment.show',
            show
        );

        owns =
            storage('owns');

        showHide =
            storage('comment');

        if (!showHide.has('hidden')) {
            showHide.set(
                'hidden',
                []
            );
        }

        if (!showHide.has('show')) {
            showHide.set(
                'show',
                []
            );
        }
    };


    return {
        gif,
        like,
        pagination,
        init,
        send,
        edit,
        reply,
        remove,
        update,
        cancel,
        show,
        showMore,
        showOrHide,
    };

})();