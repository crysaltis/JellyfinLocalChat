(() => {
    'use strict';

    if (window.__nabrisChatLoaded) {
        return;
    }

    window.__nabrisChatLoaded = true;

    const CONFIG = {
        pollInterval: 1500,
        maxLength: 500,
        green: '#329967',
        giphyApiKey: '__GIPHY_API_KEY__'
    };

    let apiClient = null;
    let currentUser = null;
    let currentUsername = '';
    let isAdministrator = false;
    let panelOpen = false;
    let initialized = false;
    let knownMessageIds = new Set();
    let unreadCount = 0;
    let pollTimer = null;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function waitForApiClient() {
        for (let i = 0; i < 120; i++) {
            if (
                window.ApiClient &&
                typeof window.ApiClient.getUrl === 'function'
            ) {
                return window.ApiClient;
            }

            await sleep(250);
        }

        throw new Error('ApiClient Jellyfin non disponibile');
    }

    function apiUrl(path) {
        return apiClient.getUrl(path.replace(/^\/+/, ''));
    }

    async function request(path, options = {}) {
        const url = apiUrl(path);
        const method = (options.method || 'GET').toUpperCase();

        if (method === 'GET') {
            return apiClient.getJSON(url);
        }

        if (method === 'POST') {
            return apiClient.ajax({
                url,
                type: 'POST',
                data: JSON.stringify(options.json || {}),
                contentType: 'application/json',
                dataType: 'json'
            });
        }

        if (method === 'DELETE') {
            return apiClient.ajax({
                url,
                type: 'DELETE'
            });
        }

        throw new Error(
            `Metodo HTTP non supportato da Nabris Chat: ${method}`
        );
    }

    async function loadCurrentUser() {
        try {
            if (typeof apiClient.getCurrentUser === 'function') {
                currentUser = await apiClient.getCurrentUser();

                currentUsername =
                    currentUser?.Name ||
                    currentUser?.name ||
                    '';

                isAdministrator = Boolean(
                    currentUser?.Policy?.IsAdministrator ??
                    currentUser?.policy?.isAdministrator
                );
            }
        } catch (error) {
            console.warn(
                '[Nabris Chat] Impossibile recuperare utente corrente',
                error
            );
        }
    }

    function getValue(object, lower, upper) {
        return object?.[lower] ?? object?.[upper];
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    function injectStyles() {
        if (document.getElementById('nabris-chat-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'nabris-chat-style';

        style.textContent = `
#nabris-chat-button {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 56px;
    height: 56px;
    border: 0;
    border-radius: 50%;
    background: ${CONFIG.green};
    color: #fff;
    cursor: pointer;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 28px rgba(0,0,0,.45);
    transition: transform .15s ease, filter .15s ease;
}

#nabris-chat-button:hover {
    transform: scale(1.06);
    filter: brightness(1.08);
}

#nabris-chat-button svg {
    width: 27px;
    height: 27px;
    fill: currentColor;
}

#nabris-chat-unread {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    background: #e53935;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    display: none;
    align-items: center;
    justify-content: center;
    border: 2px solid #101010;
}

#nabris-chat-panel {
    position: fixed;
    right: 24px;
    bottom: 92px;
    width: 390px;
    height: min(620px, calc(100vh - 130px));
    background: rgba(19,19,19,.98);
    color: #fff;
    border-radius: 16px;
    overflow: hidden;
    z-index: 99999;
    box-shadow: 0 16px 55px rgba(0,0,0,.6);
    border: 1px solid rgba(255,255,255,.08);
    display: none;
    flex-direction: column;
    backdrop-filter: blur(18px);
}

#nabris-chat-panel.open {
    display: flex;
}

.nabris-chat-header {
    padding: 16px 18px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(50,153,103,.12);
    border-bottom: 1px solid rgba(50,153,103,.28);
}

.nabris-chat-title {
    font-size: 17px;
    font-weight: 700;
}

.nabris-chat-subtitle {
    margin-top: 3px;
    color: rgba(255,255,255,.55);
    font-size: 12px;
}

.nabris-chat-close {
    border: 0;
    background: transparent;
    color: rgba(255,255,255,.65);
    cursor: pointer;
    font-size: 25px;
    line-height: 1;
    padding: 4px 7px;
}

.nabris-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    scroll-behavior: smooth;
}

.nabris-chat-message {
    margin-bottom: 13px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}

.nabris-chat-message.mine {
    align-items: flex-end;
}

.nabris-chat-message-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0 5px 4px;
    font-size: 11px;
    color: rgba(255,255,255,.48);
}

.nabris-chat-message-user {
    color: ${CONFIG.green};
    font-weight: 700;
}

.nabris-chat-message.mine .nabris-chat-message-user {
    color: rgba(255,255,255,.72);
}

.nabris-chat-bubble {
    max-width: 82%;
    border-radius: 13px 13px 13px 4px;
    padding: 9px 12px;
    background: #292929;
    line-height: 1.4;
    word-break: break-word;
    white-space: pre-wrap;
}

.nabris-chat-message.mine .nabris-chat-bubble {
    background: ${CONFIG.green};
    border-radius: 13px 13px 4px 13px;
}

.nabris-chat-deleted {
    opacity: .55;
    font-style: italic;
}

.nabris-chat-delete {
    margin-left: 3px;
    border: 0;
    background: transparent;
    color: rgba(255,255,255,.38);
    cursor: pointer;
    font-size: 12px;
}

.nabris-chat-delete:hover {
    color: #fff;
}

.nabris-chat-empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: rgba(255,255,255,.45);
    padding: 30px;
}

.nabris-chat-composer {
    padding: 12px;
    border-top: 1px solid rgba(255,255,255,.08);
    display: flex;
    gap: 9px;
    background: rgba(0,0,0,.18);
    position: relative;
}

.nabris-chat-tool {
    width: 42px;
    min-width: 42px;
    height: 42px;
    padding: 0;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 11px;
    background: #222;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font: inherit;
}

.nabris-chat-tool:hover {
    border-color: ${CONFIG.green};
}

#nabris-chat-emoji-picker {
    position: absolute;
    left: 12px;
    bottom: 66px;
    width: 268px;
    padding: 10px;
    display: none;
    grid-template-columns: repeat(7, 34px);
    grid-auto-rows: 34px;
    gap: 4px;
    justify-content: center;
    background: #171717;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 12px;
    box-shadow: 0 12px 35px rgba(0,0,0,.55);
    z-index: 10;
}

#nabris-chat-emoji-picker.open {
    display: grid;
}

.nabris-chat-emoji-item {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
    user-select: none;
    font-family:
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Noto Color Emoji",
        sans-serif;
    font-size: 21px;
    line-height: 1;
}

.nabris-chat-emoji-item:hover {
    background: rgba(50,153,103,.18);
}

.nabris-chat-bubble-gif {
    padding: 4px !important;
    background: transparent !important;
}

.nabris-chat-gif {
    display: block;
    max-width: 250px;
    max-height: 280px;
    border-radius: 10px;
    object-fit: contain;
}


#nabris-chat-giphy-panel {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 66px;
    height: 330px;

    display: none;
    flex-direction: column;

    background: #171717;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 12px;

    box-shadow: 0 14px 40px rgba(0,0,0,.65);
    overflow: hidden;

    z-index: 20;
}

#nabris-chat-giphy-panel.open {
    display: flex;
}

.nabris-chat-giphy-search {
    display: flex;
    gap: 8px;
    padding: 10px;

    border-bottom: 1px solid rgba(255,255,255,.08);
}

#nabris-chat-giphy-input {
    flex: 1;
    min-width: 0;

    border: 1px solid rgba(255,255,255,.12);
    background: #222;
    color: #fff;

    border-radius: 9px;
    padding: 9px 11px;

    outline: none;
    font: inherit;
}

#nabris-chat-giphy-input:focus {
    border-color: ${CONFIG.green};
}

#nabris-chat-giphy-search-button {
    border: 0;
    border-radius: 9px;

    padding: 0 13px;

    background: ${CONFIG.green};
    color: #fff;

    cursor: pointer;
}

#nabris-chat-giphy-results {
    flex: 1;

    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;

    padding: 8px;

    overflow-y: auto;
}

.nabris-chat-giphy-result {
    position: relative;

    min-height: 75px;

    border-radius: 8px;
    overflow: hidden;

    background: #222;

    cursor: pointer;
}

.nabris-chat-giphy-result:hover {
    outline: 2px solid ${CONFIG.green};
}

.nabris-chat-giphy-result img {
    width: 100%;
    height: 100%;

    min-height: 75px;

    display: block;

    object-fit: cover;
}

.nabris-chat-giphy-status {
    grid-column: 1 / -1;

    display: flex;
    align-items: center;
    justify-content: center;

    color: rgba(255,255,255,.55);

    text-align: center;
    padding: 25px;
}

.nabris-chat-giphy-credit {
    flex-shrink: 0;

    padding: 5px 10px 8px;

    color: rgba(255,255,255,.38);

    text-align: right;
    font-size: 10px;
}

#nabris-chat-input {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(255,255,255,.12);
    background: #222;
    color: #fff;
    border-radius: 11px;
    padding: 11px 13px;
    outline: none;
    font: inherit;
}

#nabris-chat-input:focus {
    border-color: ${CONFIG.green};
}

#nabris-chat-send {
    width: 44px;
    min-width: 44px;
    border: 0;
    border-radius: 11px;
    background: ${CONFIG.green};
    color: #fff;
    cursor: pointer;
    font-size: 19px;
}

#nabris-chat-send:disabled {
    opacity: .4;
    cursor: default;
}

.nabris-chat-error {
    padding: 8px 13px;
    background: rgba(180,30,30,.25);
    color: #ffb3b3;
    font-size: 12px;
    display: none;
}

@media (max-width: 600px) {
    #nabris-chat-panel {
        right: 8px;
        left: 8px;
        bottom: 78px;
        width: auto;
        height: calc(100vh - 100px);
        border-radius: 14px;
    }

    #nabris-chat-button {
        right: 16px;
        bottom: 16px;
        width: 52px;
        height: 52px;
    }
}
`;

        document.head.appendChild(style);
    }

    function buildInterface() {
        if (document.getElementById('nabris-chat-button')) {
            return;
        }

        injectStyles();

        const button = document.createElement('button');
        button.id = 'nabris-chat-button';
        button.type = 'button';
        button.setAttribute('aria-label', 'Apri Nabris Chat');
        button.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4v-4.5A2 2 0 0 1 2 16V6a2 2 0 0 1 2-2z"/>
            </svg>
        `;

        const unread = createElement('span');
        unread.id = 'nabris-chat-unread';
        button.appendChild(unread);

        const panel = createElement('section');
        panel.id = 'nabris-chat-panel';

        const header = createElement('div', 'nabris-chat-header');

        const heading = createElement('div');
        const title = createElement(
            'div',
            'nabris-chat-title',
            'Nabris Chat'
        );
        const subtitle = createElement(
            'div',
            'nabris-chat-subtitle',
            'Chat pubblica'
        );

        heading.append(title, subtitle);

        const close = createElement(
            'button',
            'nabris-chat-close',
            '×'
        );
        close.type = 'button';

        header.append(heading, close);

        const error = createElement('div', 'nabris-chat-error');
        error.id = 'nabris-chat-error';

        const messages = createElement(
            'div',
            'nabris-chat-messages'
        );
        messages.id = 'nabris-chat-messages';

        const composer = createElement(
            'div',
            'nabris-chat-composer'
        );

        const emojiButton = createElement(
            'button',
            'nabris-chat-tool',
            '☺'
        );
        emojiButton.type = 'button';
        emojiButton.title = 'Emoticon';

        const gifButton = createElement(
            'button',
            'nabris-chat-tool',
            'GIF'
        );
        gifButton.type = 'button';
        gifButton.title = 'Invia GIF';

        const emojiPicker = createElement('div');
        emojiPicker.id = 'nabris-chat-emoji-picker';

        const emojis = [
            '😀','😂','😊','😍','😎','🤔','😅',
            '😭','😡','👍','👎','👏','🙏','👀',
            '❤','💚','🔥','⭐','🎉','🎬','🍿'
        ];

        for (const emoji of emojis) {
            const item = createElement(
                'span',
                'nabris-chat-emoji-item',
                emoji
            );

            item.setAttribute('role', 'button');

            item.addEventListener('click', event => {
                event.stopPropagation();
                insertEmoji(emoji);
            });

            emojiPicker.appendChild(item);
        }

        const giphyPanel = createElement('div');
        giphyPanel.id = 'nabris-chat-giphy-panel';

        const giphySearchRow = createElement(
            'div',
            'nabris-chat-giphy-search'
        );

        const giphyInput = document.createElement('input');
        giphyInput.id = 'nabris-chat-giphy-input';
        giphyInput.type = 'search';
        giphyInput.maxLength = 50;
        giphyInput.autocomplete = 'off';
        giphyInput.placeholder = 'Cerca una GIF…';

        const giphySearchButton = createElement(
            'button',
            '',
            'Cerca'
        );
        giphySearchButton.id =
            'nabris-chat-giphy-search-button';
        giphySearchButton.type = 'button';

        giphySearchRow.append(
            giphyInput,
            giphySearchButton
        );

        const giphyResults = createElement('div');
        giphyResults.id = 'nabris-chat-giphy-results';

        const giphyInitial = createElement(
            'div',
            'nabris-chat-giphy-status',
            'Cerca una GIF'
        );

        giphyResults.appendChild(giphyInitial);

        const giphyCredit = createElement(
            'div',
            'nabris-chat-giphy-credit',
            'Powered by GIPHY'
        );

        giphyPanel.append(
            giphySearchRow,
            giphyResults,
            giphyCredit
        );

        const input = document.createElement('input');
        input.id = 'nabris-chat-input';
        input.type = 'text';
        input.maxLength = CONFIG.maxLength;
        input.autocomplete = 'off';
        input.placeholder = 'Scrivi un messaggio…';

        const send = createElement(
            'button',
            '',
            '➤'
        );
        send.id = 'nabris-chat-send';
        send.type = 'button';

        composer.append(
            emojiPicker,
            giphyPanel,
            emojiButton,
            gifButton,
            input,
            send
        );
        panel.append(header, error, messages, composer);

        document.body.append(button, panel);

        button.addEventListener('click', togglePanel);
        close.addEventListener('click', closePanel);
        send.addEventListener('click', sendMessage);

        emojiButton.addEventListener('click', event => {
            event.stopPropagation();
            emojiPicker.classList.toggle('open');
        });

        gifButton.addEventListener('click', event => {
            event.stopPropagation();

            emojiPicker.classList.remove('open');

            giphyPanel.classList.toggle('open');

            if (giphyPanel.classList.contains('open')) {
                giphyInput.focus();
            }
        });

        giphySearchButton.addEventListener(
            'click',
            searchGiphy
        );

        giphyInput.addEventListener(
            'keydown',
            event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    searchGiphy();
                }
            }
        );

        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });
    }

    function insertEmoji(emoji) {
        const input = document.getElementById(
            'nabris-chat-input'
        );

        if (!input) {
            return;
        }

        const start =
            input.selectionStart ?? input.value.length;

        const end =
            input.selectionEnd ?? input.value.length;

        input.value =
            input.value.slice(0, start) +
            emoji +
            input.value.slice(end);

        const cursor = start + emoji.length;

        input.focus();
        input.setSelectionRange(cursor, cursor);

        document
            .getElementById('nabris-chat-emoji-picker')
            ?.classList.remove('open');

        document
            .getElementById('nabris-chat-giphy-panel')
            ?.classList.remove('open');
    }

    function normalizeGifUrl(value) {
        try {
            const url = new URL(value.trim());

            if (url.protocol !== 'https:') {
                return null;
            }

            const path =
                url.pathname.toLowerCase();

            if (!path.endsWith('.gif')) {
                return null;
            }

            return url.toString();

        } catch {
            return null;
        }
    }

    function parseGifToken(text) {
        const match =
            /^\[\[gif:(https:\/\/[^\]]+)\]\]$/.exec(
                text || ''
            );

        if (!match) {
            return null;
        }

        return normalizeGifUrl(match[1]);
    }

    async function sendGifUrl(url) {
        const normalized = normalizeGifUrl(url);

        if (!normalized) {
            showError('GIF non valida.');
            return;
        }

        showError('');

        try {
            await request('NabrisChat/Messages', {
                method: 'POST',
                json: {
                    text: `[[gif:${normalized}]]`
                }
            });

            document
                .getElementById(
                    'nabris-chat-giphy-panel'
                )
                ?.classList.remove('open');

            await refreshMessages(true);

        } catch (error) {
            console.error('[Nabris Chat]', error);

            showError(
                'Invio della GIF non riuscito.'
            );
        }
    }

    async function searchGiphy() {
        const input = document.getElementById(
            'nabris-chat-giphy-input'
        );

        const results = document.getElementById(
            'nabris-chat-giphy-results'
        );

        if (!input || !results) {
            return;
        }

        const query = input.value.trim();

        if (!query) {
            return;
        }

        /*
         * Manteniamo anche il vecchio comportamento:
         * se incolli direttamente una URL .gif, la invia.
         */
        const directGif = normalizeGifUrl(query);

        if (directGif) {
            await sendGifUrl(directGif);
            return;
        }

        if (
            !CONFIG.giphyApiKey ||
            CONFIG.giphyApiKey ===
                '__GIPHY_API_KEY__'
        ) {
            showError(
                'Chiave GIPHY non configurata.'
            );
            return;
        }

        results.replaceChildren(
            createElement(
                'div',
                'nabris-chat-giphy-status',
                'Ricerca…'
            )
        );

        try {
            const params = new URLSearchParams({
                api_key: CONFIG.giphyApiKey,
                q: query,
                limit: '12',
                rating: 'pg-13',
                lang: 'it',
                bundle: 'messaging_non_clips'
            });

            const response = await fetch(
                'https://api.giphy.com/v1/gifs/search?' +
                params.toString(),
                {
                    method: 'GET',
                    cache: 'no-store'
                }
            );

            if (!response.ok) {
                throw new Error(
                    `GIPHY HTTP ${response.status}`
                );
            }

            const payload = await response.json();
            const gifs = payload?.data || [];

            results.replaceChildren();

            if (!gifs.length) {
                results.appendChild(
                    createElement(
                        'div',
                        'nabris-chat-giphy-status',
                        'Nessun risultato'
                    )
                );

                return;
            }

            for (const gif of gifs) {
                const preview =
                    gif?.images?.fixed_width?.url ||
                    gif?.images?.downsized?.url ||
                    gif?.images?.original?.url;

                const sendUrl =
                    gif?.images?.fixed_width?.url ||
                    gif?.images?.downsized_medium?.url ||
                    gif?.images?.original?.url;

                if (!preview || !sendUrl) {
                    continue;
                }

                const tile = createElement(
                    'div',
                    'nabris-chat-giphy-result'
                );

                tile.setAttribute(
                    'role',
                    'button'
                );

                tile.setAttribute(
                    'tabindex',
                    '0'
                );

                const image =
                    document.createElement('img');

                image.src = preview;
                image.alt =
                    gif?.title || 'GIF GIPHY';

                image.loading = 'lazy';

                tile.appendChild(image);

                const selectGif = async () => {
                    await sendGifUrl(sendUrl);
                };

                tile.addEventListener(
                    'click',
                    selectGif
                );

                tile.addEventListener(
                    'keydown',
                    event => {
                        if (
                            event.key === 'Enter' ||
                            event.key === ' '
                        ) {
                            event.preventDefault();
                            selectGif();
                        }
                    }
                );

                results.appendChild(tile);
            }

        } catch (error) {
            console.error(
                '[Nabris Chat] GIPHY',
                error
            );

            results.replaceChildren(
                createElement(
                    'div',
                    'nabris-chat-giphy-status',
                    'Ricerca GIF non disponibile.'
                )
            );
        }
    }

    function togglePanel() {
        panelOpen
            ? closePanel()
            : openPanel();
    }

    function openPanel() {
        panelOpen = true;

        document
            .getElementById('nabris-chat-panel')
            ?.classList.add('open');

        unreadCount = 0;
        updateUnreadBadge();

        document
            .getElementById('nabris-chat-input')
            ?.focus();

        refreshMessages(true);
    }

    function closePanel() {
        panelOpen = false;

        document
            .getElementById('nabris-chat-panel')
            ?.classList.remove('open');

        document
            .getElementById('nabris-chat-emoji-picker')
            ?.classList.remove('open');
    }

    function updateUnreadBadge() {
        const badge = document.getElementById(
            'nabris-chat-unread'
        );

        if (!badge) {
            return;
        }

        if (unreadCount <= 0) {
            badge.style.display = 'none';
            badge.textContent = '';
            return;
        }

        badge.textContent =
            unreadCount > 99
                ? '99+'
                : String(unreadCount);

        badge.style.display = 'flex';
    }

    function showError(message) {
        const element = document.getElementById(
            'nabris-chat-error'
        );

        if (!element) {
            return;
        }

        if (!message) {
            element.style.display = 'none';
            element.textContent = '';
            return;
        }

        element.textContent = message;
        element.style.display = 'block';
    }

    function formatTime(value) {
        if (!value) {
            return '';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return new Intl.DateTimeFormat('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function renderMessages(messages) {
        const container = document.getElementById(
            'nabris-chat-messages'
        );

        if (!container) {
            return;
        }

        const wasNearBottom =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight < 80;

        container.replaceChildren();

        if (!messages.length) {
            container.appendChild(
                createElement(
                    'div',
                    'nabris-chat-empty',
                    'Ancora nessun messaggio. Inizia la conversazione.'
                )
            );
            return;
        }

        for (const message of messages) {
            const id = getValue(message, 'id', 'Id');
            const username =
                getValue(message, 'username', 'Username') || 'Utente';
            const text =
                getValue(message, 'message', 'Message') || '';
            const timestamp =
                getValue(message, 'timestamp', 'Timestamp');
            const deleted =
                Boolean(getValue(message, 'deleted', 'Deleted'));

            const mine =
                currentUsername &&
                username.toLowerCase() ===
                    currentUsername.toLowerCase();

            const row = createElement(
                'div',
                `nabris-chat-message${mine ? ' mine' : ''}`
            );

            const meta = createElement(
                'div',
                'nabris-chat-message-meta'
            );

            const user = createElement(
                'span',
                'nabris-chat-message-user',
                username
            );

            const time = createElement(
                'span',
                '',
                formatTime(timestamp)
            );

            meta.append(user, time);

            if (!deleted && (mine || isAdministrator)) {
                const remove = createElement(
                    'button',
                    'nabris-chat-delete',
                    'Elimina'
                );
                remove.type = 'button';

                remove.addEventListener('click', () => {
                    deleteMessage(id);
                });

                meta.appendChild(remove);
            }

            const bubble = createElement(
                'div',
                `nabris-chat-bubble${
                    deleted ? ' nabris-chat-deleted' : ''
                }`
            );

            if (deleted) {
                bubble.textContent =
                    'Messaggio eliminato';
            } else {
                const gifUrl = parseGifToken(text);

                if (gifUrl) {
                    bubble.classList.add(
                        'nabris-chat-bubble-gif'
                    );

                    const image =
                        document.createElement('img');

                    image.className =
                        'nabris-chat-gif';

                    image.src = gifUrl;
                    image.alt = 'GIF';
                    image.loading = 'lazy';

                    bubble.appendChild(image);
                } else {
                    bubble.textContent = text;
                }
            }

            row.append(meta, bubble);
            container.appendChild(row);
        }

        if (wasNearBottom || panelOpen) {
            container.scrollTop = container.scrollHeight;
        }
    }

    async function refreshMessages(force = false) {
        try {
            const messages = await request(
                'NabrisChat/Messages?limit=200'
            );

            showError('');

            const newIds = new Set();

            for (const message of messages) {
                const id = String(
                    getValue(message, 'id', 'Id') || ''
                );

                if (!id) {
                    continue;
                }

                newIds.add(id);

                if (
                    initialized &&
                    !knownMessageIds.has(id) &&
                    !panelOpen
                ) {
                    const username =
                        getValue(
                            message,
                            'username',
                            'Username'
                        ) || '';

                    if (
                        !currentUsername ||
                        username.toLowerCase() !==
                            currentUsername.toLowerCase()
                    ) {
                        unreadCount++;
                    }
                }
            }

            knownMessageIds = newIds;

            if (!initialized) {
                initialized = true;
            }

            updateUnreadBadge();
            renderMessages(messages);
        } catch (error) {
            console.error('[Nabris Chat]', error);

            if (force || panelOpen) {
                showError(
                    'Impossibile collegarsi alla chat.'
                );
            }
        }
    }

    async function sendMessage() {
        const input = document.getElementById(
            'nabris-chat-input'
        );
        const send = document.getElementById(
            'nabris-chat-send'
        );

        if (!input || !send) {
            return;
        }

        const text = input.value.trim();

        if (!text) {
            return;
        }

        send.disabled = true;
        showError('');

        try {
            await request('NabrisChat/Messages', {
                method: 'POST',
                json: { text }
            });

            input.value = '';

            await refreshMessages(true);
        } catch (error) {
            console.error('[Nabris Chat]', error);
            showError('Invio del messaggio non riuscito.');
        } finally {
            send.disabled = false;
            input.focus();
        }
    }

    async function deleteMessage(id) {
        if (!id) {
            return;
        }

        if (!window.confirm('Eliminare questo messaggio?')) {
            return;
        }

        try {
            await request(
                `NabrisChat/Messages/${encodeURIComponent(id)}`,
                { method: 'DELETE' }
            );

            await refreshMessages(true);
        } catch (error) {
            console.error('[Nabris Chat]', error);
            showError(
                'Non hai i permessi per eliminare il messaggio.'
            );
        }
    }

    document.addEventListener('click', event => {
        const picker =
            document.getElementById(
                'nabris-chat-emoji-picker'
            );

        const giphy =
            document.getElementById(
                'nabris-chat-giphy-panel'
            );

        if (
            picker &&
            !picker.contains(event.target)
        ) {
            picker.classList.remove('open');
        }

        if (
            giphy &&
            !giphy.contains(event.target)
        ) {
            giphy.classList.remove('open');
        }
    });

    async function init() {
        try {
            apiClient = await waitForApiClient();

            await loadCurrentUser();

            buildInterface();

            await refreshMessages();

            pollTimer = window.setInterval(
                () => refreshMessages(false),
                CONFIG.pollInterval
            );

            console.info(
                '[Nabris Chat] Client avviato',
                {
                    user: currentUsername || 'sconosciuto'
                }
            );
        } catch (error) {
            console.error(
                '[Nabris Chat] Avvio fallito',
                error
            );

            window.__nabrisChatLoaded = false;
        }
    }

    init();
})();
