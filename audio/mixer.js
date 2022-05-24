/**
 * An Channel is like a stateful StagedTrack. The key difference
 * between the two is the StagedTrack holds a reference to the track in the
 * track library so that when you change track information the StagedTracks
 * do not need to be updated. An Channel contains all the information
 * needed to play a channel. Making it the object we want to send over the wire.
 */
class Channel {
    /**
     * The track name
     * @type {string}
     */
    name;

    /**
     * The track source
     * @type {string}
     */
    src;

    /**
     * The current channel volume
     * @type {number}
     */
    volume = 1;

    /**
     * Loop this track
     * @type {boolean}
     */
    loop = false;

    /**
     * Is this channel paused
     * @type {boolean}
     */
    paused = false;

    /**
     * @param {string} name
     * @param {string} src
     */
    constructor(name, src) {
        this.name = name;
        this.src = src;
    }

    /**
     * @static
     * @param {any} obj
     * @return {Channel}
     */
    static assign(obj) {
        return Object.assign(new Channel(), obj)
    }
}

/**
 * MixerState is the stateful representation of the mixer. Audio players are not
 * stateful and can not be transmitted over a wire so this object holds all the
 * current state of the mixer so that it can be easily be saved to local storage
 * and sent over the message bus to sync other mixers.
 */
class MixerState {
    /**
     * The current master volume
     * @type {number}
     */
    volume = .5

    /**
     * If we are currently paused
     * @type {boolean}
     */
    paused = false;

    /**
     * A dictionary of channels currently in the mixer
     * @type {Object.<string, Channel>}
     */
    channels = {};

    /**
     * @static
     * @param {*} obj
     * @returns {MixerState}
     */
    static assign(obj) {
        // rehydrate channels
        const channels = {}
        Object.entries(obj.channels ?? {}).forEach(([id, channel]) =>
            channels[id] = Channel.assign(channel)
        );
        delete obj.channels;

        // deserialize the rest
        const state = new MixerState;
        state.channels = channels
        return Object.assign(state, obj)
    }
}

/**
 * Events enum
 */
const mixerEvents = Object.freeze(
    {
        ON_CHANNEL_LIST_CHANGE: 'onChannelListChange',
        ON_PLAY_PAUSE: 'onPlayPause',
    }
);

/**
 * Creates a generic volume slider
 * @return {HTMLInputElement}
 */
function volumeSlider() {
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = 1;
    slider.step = .01;
    slider.className = "volume-control";
    return slider;
}

/**
 * The Mixers is responsible for mixing together and controlling the play/pause
 * state of the various Channels and controlling the master volume. Mixer state
 * is persisted to local storage, so browser refreshes are not disruptive.
 */
class Mixer extends EventTarget {
    /**
     * A map of the current Audio players
     * @private
     * @type {Object.<string, HTMLAudioElement}
     */
    _players = {};

    /**
     * The the local storage key used for persisting MixerState to local storage
     * @private
     * @type {string}
     */
    _localStorageKey;

    /**
     * The gameID is required for persisting mixer state
     * @param {string} gameID
     */
    constructor(gameID) {
        super();
        this._localStorageKey = `audio.mixer.${gameID}`;
    }

    /**
     * @private
     * Syncs the mixer state from local storage into native Audio object
     */
    _syncPlayers() {
        const state = this.state();

        // create and update players
        Object.entries(state.channels).forEach(([id, channel]) => {
            let player = this._players[id]

            // create new player if needed
            if (!(player)) {
                player = new Audio();
                player.preload = "auto";
                player.src = channel.src;
                this._players[id] = player;
            }

            // sync player
            player.volume = state.volume * channel.volume;
            player.loop = channel.loop;
            if (state.paused || channel.paused) {
                player.pause();
            } else {
                player.play();
            }
        });

        // delete players that no longer have a channel associated with them
        Object.entries(this._players).forEach(([id, player]) => {
            if (!(id in state.channels)) {
                player.pause();
                delete this._players[id];
            }
        });
    }

    /**
     * Save mixer state to local storage and sync
     * @private
     * @param {MixerState} state
     */
    _write(state) {
        localStorage.setItem(this._localStorageKey, JSON.stringify(state));
        this._syncPlayers();
    }

    /**
     * Returns the mixer state from local storage
     * @returns {MixerState}
     */
    state() {
        return MixerState.assign(JSON.parse(localStorage.getItem(this._localStorageKey) ?? "{}"));
    }

    // volume

    /**
     * Set the master volume
     * @type {number}
     */
    set volume(v) {
        const state = this.state();
        state.volume = v;
        this._write(state);
    }

    /**
     * Gets teh current master volume
     * @type {number}
     */
    get volume() {
        return this.state().volume;
    }

    // play / pause

    /**
     * Get the play / pause state of the mixer
     * @returns {boolean}
     */
    get paused() {
        return this.state().paused;
    }

    /**
     * Plays the mixer. Only channels that are set to playing will play.
     */
    play() {
        const state = this.state();
        state.paused = false;
        this._write(state);
        this.dispatchEvent(new Event(mixerEvents.ON_PLAY_PAUSE));
    }

    /**
     * Pauses the mixer
     */
    pause() {
        const state = this.state();
        state.paused = true;
        this._write(state);
        this.dispatchEvent(new Event(mixerEvents.ON_PLAY_PAUSE));
    }

    /**
     * Toggle the paused state of the mixer
     */
    togglePaused() {
        this.paused ? this.play() : this.pause();
    }

    // channels

    /**
     * Returns the current channels in the mixer
     * @returns {Object.<string, Channel>}
     */
    channels() {
        return this.state().channels;
    }

    // CRUD

    /**
     * Add a channel in the mixer
     * @param {Channel} channel
     */
    addChannel(channel) {
        const state = this.state();
        state.channels[uuid()] = channel;
        this._write(state);
        this.dispatchEvent(new Event(mixerEvents.ON_CHANNEL_LIST_CHANGE));
    }

    /**
     * Return a specific channel from the mixer
     * @param {string} id
     * @returns {Channel}
     */
    readChannel(id) {
        const state = this.state();
        if (!(state.channels[id])) {
            throw `Channel ${id} does not exist in mixer`;
        }
        return state.channels[id];
    }

    /**
     * Update an already existing channel in the mixer
     * @param {string} id
     * @param {Channel} channel
     */
    updateChannel(id, channel) {
        const state = this.state();
        if (!(state.channels[id])) {
            throw `Channel ${id} does not exist in mixer`;
        }
        state.channels[id] = channel;
        this._write(state);
    }

    /**
     * Delete a channel from the mixer
     * @param {string} id
     */
    deleteChannel(id) {
        const state = this.state();
        delete state.channels[id];
        this._write(state);
        this.dispatchEvent(new Event(mixerEvents.ON_CHANNEL_LIST_CHANGE));
    }

    // extras
    clear() {
        const state = this.state();
        state.paused = true;
        state.channels = {};
        this._write(state);
        this.dispatchEvent(new Event(mixerEvents.ON_PLAY_PAUSE));
        this.dispatchEvent(new Event(mixerEvents.ON_CHANNEL_LIST_CHANGE));
    }


    // UI components

    /**
     * Creates a the master volume slider element
     * @returns {HTMLInputElement}
     */
    masterVolumeSlider() {
        const slider = volumeSlider();
        slider.value = this.volume;
        slider.oninput = this._masterSliderOnInput;
        slider.onchange = this._masterSliderOnChange;

        return slider
    }

    /**
     * On input master slider callback
     * @private
     * @param {InputEvent} e
     */
    _masterSliderOnInput = (e) => {
        Object.entries(this.channels()).forEach(([id, channel]) =>
            this._players[id].volume = e.target.value * channel.volume
        );
    }

    /**
     * On change master slider callback
     * @private
     * @param {InputEvent} e
     */
    _masterSliderOnChange = (e) => {
        this.volume = e.target.value;
    }

    /**
     * Creates a channel volume slider element
     * @param {number} id
     * @returns {HTMLInputElement}
     */
    channelVolumeSlider(id) {
        const slider = volumeSlider();
        slider.setAttribute('data-id', id);

        const channel = this.readChannel(id);
        slider.value = channel.volume;
        slider.oninput = this._channelSliderOnInput;
        slider.onchange = this._channelSliderOnChange;

        return slider
    }

    /**
     * On input channel slider callback
     * @private
     * @param {InputEvent} e
     */
    _channelSliderOnInput = (e) => {
        this._players[e.target.getAttribute('data-id')].volume = this.volume * e.target.value;
    }

    /**
     * On change channel slider callback
     * @private
     * @param {InputEvent} e
     */
    _channelSliderOnChange = (e) => {
        const id = e.target.getAttribute('data-id');
        const channel = this.readChannel(id);
        channel.volume = e.target.value;
        this.updateChannel(id, channel);
    }


    // handlers

    /**
     * Register a call back for onChannelListChange events
     * @param {EventListenerOrEventListenerObject} callback
     */
    onChannelListChange(callback) {
        this.addEventListener(mixerEvents.ON_CHANNEL_LIST_CHANGE, callback);
    }

    /**
     * Register a call back for onPlayPause events
     * @param {EventListenerOrEventListenerObject} callback
     */
    onPlayPause(callback) {
        this.addEventListener(mixerEvents.ON_PLAY_PAUSE, callback);
    }
}


const mixer = new Mixer($("#message-broker-client").attr("data-gameId"));

export { Channel, mixerEvents, mixer };
