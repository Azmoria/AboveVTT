import { trackLibrary } from './track.js';
import { Channel } from './mixer.js';
import { log } from './helpers.js';

/**
 *
 * @returns {HTMLDivElement}
 */
function masterVolumeSlider() {
    const div = document.createElement("div");
    div.textContent = "Master Volume";
    div.className = "audio-row";
    div.id = "master-volume"
    div.append(window.MIXER.masterVolumeSlider());

    return div;
}

function init_mixer() {
    // header
    const header = document.createElement("h3");
    header.textContent = "Mixer";

    // mixer channels
    const mixerChannels = document.createElement("ul");
    mixerChannels.id = 'mixer-channels';

    /** @param {Object.<string, Channel>} */
    const drawChannelList = (channels) => {
        mixerChannels.innerHTML = "";
        let youtube_section= $("<li class='audio-row'></li>");;    
        let channelNameDiv = $(`<div class='channelNameOverflow'><div class='channelName'>Animated Map Audio</div>`)
        let youtube_volume = $(`<input type="range" min="0." max="100" value="${window.YTPLAYER ? window.YTPLAYER.volume : 50}" step="1" class="volume-control" id="youtube_volume">`);
        $(youtube_section).append(channelNameDiv, youtube_volume);
        $(mixerChannels).append(youtube_section);
        youtube_volume.on("change", function() {
            window.YTPLAYER.volume = $("#youtube_volume").val();
            if (window.YTPLAYER) {
                window.YTPLAYER.setVolume(window.YTPLAYER.volume*$("#master-volume input").val());
                data={
                    volume: window.YTPLAYER.volume
                };
                window.MB.sendMessage("custom/myVTT/changeyoutube",data);
            }
        });
        var text_calc = $(`<div class='channelName'>Animated Map Audio</span>`);
        $('body').prepend(text_calc);
        var nameWidth = $('body').find('div.channelName:first').width();
        text_calc.remove();
        channelNameDiv.find(".channelName").css("--name-width-overflow", (100 - nameWidth < 0) ? 90 - nameWidth+'px' : 0);
        /** @type {Object.<string, Channel>} */
        Object.entries(channels).forEach(([id, channel]) => {
            const item = document.createElement("li");
            item.className = "audio-row";
            let channelNameDiv = $(`<div class='channelNameOverflow'><div class='channelName'>${channel.name}</div></div>`)
            item.setAttribute("data-id", id);

              
            var text_calc = $(`<div class='channelName'>${channel.name}</span>`);
            $('body').prepend(text_calc);
            var nameWidth = $('body').find('div.channelName:first').width();
            text_calc.remove();
            channelNameDiv.find(".channelName").css("--name-width-overflow", (100 - nameWidth < 0) ? 90 - nameWidth+'px' : 0);

            //item.append(window.MIXER.channelVolumeSlider(id), window.MIXER.channelProgressBar(id));
            let remove = $('<button class="channel-remove-button"">X</button>');
            remove.off().on("click", function(){
                window.MIXER.deleteChannel(id);
            });
            // repeat button
            let loop = $('<button class="channel-loop-button""></button>');
            let loop_svg = $(`<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M7 22 3 18 7 14 8.4 15.45 6.85 17H17V13H19V19H6.85L8.4 20.55ZM5 11V5H17.15L15.6 3.45L17 2L21 6L17 10L15.6 8.55L17.15 7H7V11Z"/></svg>`);
            loop.append(loop_svg);

            // play/pause button
            let channel_play_pause = $('<button class="channel-play-pause-button""></button>');
            let play_svg = $('<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M8 19V5L19 12ZM10 12ZM10 15.35 15.25 12 10 8.65Z"/></svg>');
            let pause_svg = $('<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M14 19V5H18V19ZM6 19V5H10V19Z"/></svg>');
            
            channel_play_pause.append(play_svg);

            //Activate Swap button when channel.paused

            channel_play_pause.append(pause_svg);
            if(channel.paused) {
                play_svg.css('display', 'block');
                pause_svg.css('display', 'none');
                channel_play_pause.toggleClass('playing', false);
                channel_play_pause.toggleClass('pressed', false);
            }
            else {
                pause_svg.css('display', 'block');
                play_svg.css('display', 'none');
                channel_play_pause.toggleClass('playing', true);
                channel_play_pause.toggleClass('pressed', true);
            }
                
            channel_play_pause.append(play_svg);
            channel_play_pause.append(pause_svg);

            channel_play_pause.on('click', function(){
                if(channel.paused) {
                    play_svg.css('display', 'none');
                    pause_svg.css('display', 'block');
                    channel_play_pause.toggleClass('playing', true);
                    channel_play_pause.toggleClass('pressed', true);
                    channel.paused = false;
                    window.MIXER.updateChannel(id, channel);
                }
                else {
                    pause_svg.css('display', 'none');
                    play_svg.css('display', 'block');
                    channel_play_pause.toggleClass('playing', false);
                    channel_play_pause.toggleClass('pressed', false);
                    channel.paused = true;
                    window.MIXER.updateChannel(id, channel);
                }
            });

            if(channel.loop) {
                loop.toggleClass('pressed', true);
            }
            else {
                loop.toggleClass('pressed', false);
            }
            loop.on('click', function(){
                if(channel.loop) {
                    loop.toggleClass('pressed', false);
                    channel.loop = false;
                    window.MIXER.updateChannel(id, channel);
                }
                else {
                    loop.toggleClass('pressed', true);
                    channel.loop = true;
                    window.MIXER.updateChannel(id, channel);
                }
            });
            $(item).append(channelNameDiv, window.MIXER.channelVolumeSlider(id), channel_play_pause, loop, remove, window.MIXER.channelProgressBar(id));

            mixerChannels.append(item);
        });
    }
    drawChannelList(window.MIXER.channels())
    window.MIXER.onChannelListChange((e) => drawChannelList(e.target.channels()));

    // clear button



    let clear = $('<button class="mixer-clear-button"></button>');
    let clear_svg = $(`<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M3 16V14H10V16ZM3 12V10H14V12ZM3 8V6H14V8ZM14.4 22 13 20.6 15.6 18 13 15.4 14.4 14 17 16.6 19.6 14 21 15.4 18.4 18 21 20.6 19.6 22 17 19.4Z"/></svg>`);
    clear.append(clear_svg);
    clear.on('click', function(){window.MIXER.clear()});

    // play/pause button
    let playPause = $('<button class="mixer-play-pause-button" style="font-size:10px;"></button>');
    let mixer_playlist_svg = $('<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M2.5 8V6H14.5V8ZM2.5 12V10H14.5V12ZM2.5 16V14H10.5V16ZM15.5 21V13L21.5 17Z"/></svg>');
    let pause_svg = $('<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M14 19V5H18V19ZM6 19V5H10V19Z"/></svg>');
    if(window.MIXER.paused) {
        mixer_playlist_svg.css('display', 'block');
        pause_svg.css('display', 'none');
        playPause.toggleClass('playing', false);
        playPause.toggleClass('pressed', false);
        $('head').append(`<style id="mixer-paused" />#sounds-panel button.pressed.playing{background: #ffd03b45 !important;}</style>`);
    }
    else {
        pause_svg.css('display', 'block');
        mixer_playlist_svg.css('display', 'none');
        playPause.toggleClass('playing', true);
        playPause.toggleClass('pressed', true);
        $('style#mixer-paused').remove();
    }
        
    playPause.append(mixer_playlist_svg);
    playPause.append(pause_svg);

    playPause.on('click', function(){
        window.MIXER.togglePaused();
        if(window.MIXER.paused) {
            mixer_playlist_svg.css('display', 'block');
            pause_svg.css('display', 'none');
            playPause.toggleClass('playing', false);
            playPause.toggleClass('pressed', false);
             $('head').append(`<style id="mixer-paused" />#sounds-panel button.pressed.playing{background: #ffd03b45 !important;}</style>`);
           
        }
        else {
            pause_svg.css('display', 'block');
            mixer_playlist_svg.css('display', 'none');
            playPause.toggleClass('playing', true);
            playPause.toggleClass('pressed', true);
             $('style#mixer-paused').remove();
        }
    });
        
    $("#sounds-panel .sidebar-panel-header").append(header, masterVolumeSlider(), mixerChannels, clear, playPause);
}

function init_trackLibrary() {
    // header
    const header = document.createElement("h3");
    header.textContent = "Track Library";

    // import csv button
    const importCSV = document.createElement('button');
    importCSV.textContent = "Import CSV";
    importCSV.onclick = () => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".csv";
        fileInput.onchange = (e) => {
            const reader = new FileReader();
            reader.readAsText(e.target.files[0]);
            reader.onload = () => trackLibrary.importCSV(reader.result);
            reader.onerror = () => { throw reader.error };
        };
        fileInput.click();
    };

    const addTrack = $(`<button id='addTrack'>Add Track</button>`)
    const importTrackFields = $("<div id='importTrackFields'></div>")
    const trackName = $(`<input class='trackName trackInput' placeholder='Track Name'/>`)
    const trackSrc = $(`<input class='trackSrc trackInput' placeholder='https://.../example.mp3'/>`)
    const okButton = $('<button class="add-track-ok-button">OK</button>');  
    const cancelButton = $('<button class="add-track-cancel-button">X</button>');  
    addTrack.off().on("click", function(){
        importTrackFields.css("height", "25px");
    });
    cancelButton.off().on("click", function(){
        importTrackFields.css("height", "0px");
        trackName.val([]);
        trackSrc.val([]);
    });
    okButton.off().on("click", function(){
        importTrackFields.css("height", "0px");
        trackLibrary.addTrack(trackName.val(), trackSrc.val());
        trackName.val([]);
        trackSrc.val([]);
    });
    importTrackFields.append(trackName, trackSrc, okButton, cancelButton);

    // track list
    const trackList = document.createElement("ul");
    trackList.id = 'track-list';
    trackLibrary.onchange((e) => {
        trackList.innerHTML = "";
        /** @type {typeof trackLibrary}  */
        const tl = e.target;
        tl.map().forEach((track, id) => {
            const item = document.createElement("li");
            item.textContent = track.name;
            item.className = "audio-row";
            item.setAttribute("data-id", id);
            let track_remove_button = $('<button class="track-remove-button">X</button>');  
            track_remove_button.off().on("click", function(){
                trackLibrary.deleteTrack(id);
                item.remove();
            });
            // play button
            let track_play_button = $('<button class="track-play-pause-button"></button>');          
            let play_svg = $('<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M8 19V5L19 12ZM10 12ZM10 15.35 15.25 12 10 8.65Z"/></svg>');               
            track_play_button.append(play_svg);



            track_play_button.on('click', function(){
                const channel = new Channel(track.name, track.src);
                channel.paused = false;
                channel.loop = false;
                window.MIXER.addChannel(channel);
            });
            let track_add_button = $('<button class="track-add-to-mixer"></button>');          
            let add_svg = $('<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class=""><path fill-rule="evenodd" clip-rule="evenodd" d="M7.2 10.8V18h3.6v-7.2H18V7.2h-7.2V0H7.2v7.2H0v3.6h7.2z"></path></svg>');               
            track_add_button.append(add_svg);
            track_add_button.on('click', function(){
                const channel = new Channel(track.name, track.src);
                channel.paused = true;
                channel.loop = false;
                window.MIXER.addChannel(channel);
            });



            $(item).append(track_remove_button, track_play_button, track_add_button); 
            trackList.append(item);
        });
    });


    trackLibrary.dispatchEvent(new Event('onchange'));

    $("#sounds-panel .sidebar-panel-body").append(header, importCSV, addTrack, importTrackFields, trackList);
}

function init() {
    log(`initializing audio ui for ${window.DM ? 'DM' : 'player'}`);
    if (window.DM) {
        init_trackLibrary();
        init_mixer();
    } else {
        $("#sounds-panel .sidebar-panel-header").append(masterVolumeSlider());
    }
}

export default init;
