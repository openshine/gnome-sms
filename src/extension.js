/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/**
 Authors : Cesar Garcia Tapia <tapia@openshine.com>
 
 Copyright (c) 2012 OpenShine SL
 
 This library is free software; you can redistribute it and/or
 modify it under the terms of the GNU General Public
 License as published by the Free Software Foundation; either
 version 2 of the License, or (at your option) any later version.
 
 This library is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 Library General Public License for more details.
 
 You should have received a copy of the GNU General Public
 License along with this library; if not, write to the Free
 Software Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
 
**/

const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;

const Gettext = imports.gettext.domain('gnome-shell-extensions-mediaplayer');
const _ = Gettext.gettext;
const N_ = function(t) { return t };

const MEDIAPLAYER_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.mediaplayer';
const MEDIAPLAYER_VOLUME_MENU_KEY = 'volumemenu';
const MEDIAPLAYER_VOLUME_KEY = 'volume';
const MEDIAPLAYER_POSITION_KEY = 'position';
const MEDIAPLAYER_PLAYLISTS_KEY = 'playlists';
const MEDIAPLAYER_COVER_SIZE = 'coversize';
const MEDIAPLAYER_RUN_DEFAULT = 'rundefault';
const MEDIAPLAYER_RATING_KEY = 'rating';

const FADE_ANIMATION_TIME = 0.16;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Widget = Me.imports.widget;
const DBusIface = Me.imports.dbus;
const Lib = Me.imports.lib;

const Status = {
    STOP: N_("Stopped"),
    PLAY: N_("Playing"),
    PAUSE: N_("Paused"),
    RUN: "Run"
};

/* global values */
let settings;
let playerManager;
let mediaplayerMenu;
let tmpCover;


const Player = new Lang.Class({
    Name: 'Player',
    Extends: PopupMenu.PopupMenuSection,

    _init: function(busName, owner) {
        this.parent();

        let baseName = busName.split('.')[3];

        this._owner = owner;
        this._busName = busName;
        this._app = "";
        this._status = "";
        // Guess the name based on the dbus path
        // Should be overriden by the Identity property
        this._identity = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        this._playlists = "";
        this._playlistsMenu = "";
        this._currentPlaylist = "";
        this._currentTime = -1;
        this._wantedSeekValue = 0;
        this._timeoutId = 0;
        this._mediaServer = new DBusIface.MediaServer2(busName);
        this._mediaServerPlayer = new DBusIface.MediaServer2Player(busName);
        this._mediaServerPlaylists = new DBusIface.MediaServer2Playlists(busName);
        this._prop = new DBusIface.Properties(busName);
        this._settings = settings;

        this.showVolume = this._settings.get_boolean(MEDIAPLAYER_VOLUME_KEY);
        this._settings.connect("changed::" + MEDIAPLAYER_VOLUME_KEY, Lang.bind(this, function() {
            if (this._settings.get_boolean(MEDIAPLAYER_VOLUME_KEY)) {
                this.showVolume = true;
                if (this._status != Status.STOP)
                    this._volume.actor.show();
            }
            else {
                this.showVolume = false;
                this._volume.actor.hide();
            }
        }));
        this.showPosition = this._settings.get_boolean(MEDIAPLAYER_POSITION_KEY);
        this.supportPosition = true;
        this._settings.connect("changed::" + MEDIAPLAYER_POSITION_KEY, Lang.bind(this, function() {
            if (this._settings.get_boolean(MEDIAPLAYER_POSITION_KEY)) {
                this.showPosition = true;
                if (this._status != Status.STOP && this.supportPosition)
                    this._position.actor.show();
            }
            else {
                this.showPosition = false;
                this._position.actor.hide();
            }
        }));
        this.showPlaylists = this._settings.get_boolean(MEDIAPLAYER_PLAYLISTS_KEY);
        this._settings.connect("changed::" + MEDIAPLAYER_PLAYLISTS_KEY, Lang.bind(this, function() {
            if (this._settings.get_boolean(MEDIAPLAYER_PLAYLISTS_KEY)) {
                this.showPlaylists = true;
                this._getPlaylists();
                this._getActivePlaylist();
            }
            else {
                this.showPlaylists = false;
                if (this._playlistsMenu)
                    this._playlistsMenu.destroy();
            }
        }));
        this.coverSize = this._settings.get_int(MEDIAPLAYER_COVER_SIZE);
        this._settings.connect("changed::" + MEDIAPLAYER_COVER_SIZE, Lang.bind(this, function() {
            this.coverSize = this._settings.get_int(MEDIAPLAYER_COVER_SIZE);
        }));
        this.showRating = this._settings.get_boolean(MEDIAPLAYER_RATING_KEY);
        this._settings.connect("changed::" + MEDIAPLAYER_RATING_KEY, Lang.bind(this, function() {
            if (this._settings.get_boolean(MEDIAPLAYER_RATING_KEY)) {
                this.showRating = true;
                this.trackRating = new Widget.TrackRating(_("rating"), 0, 'track-rating', this);
                this.trackBox.addInfo(this.trackRating.box, 3);
            }
            else {
                this.showRating = false;
                this.trackRating.destroy();
            }
        }));
        let genericIcon = new St.Icon({icon_name: "audio-x-generic", icon_size: 16, icon_type: St.IconType.SYMBOLIC});
        this.playerTitle = new Widget.TitleItem(this._identity, genericIcon, Lang.bind(this, function() { this._mediaServer.QuitRemote(); }));

        this.addMenuItem(this.playerTitle);

        this.trackCoverContainer = new St.Button({style_class: 'track-cover-container', x_align: St.Align.START, y_align: St.Align.START});
        this.trackCoverContainer.connect('clicked', Lang.bind(this, this._toggleCover));
        this.trackCoverFile = false;
        this.trackCoverFileTmp = false;
        this.trackCover = new St.Icon({icon_name: "media-optical-cd-audio", icon_size: this.coverSize, icon_type: St.IconType.FULLCOLOR});
        this.trackCoverContainer.set_child(this.trackCover);

        this.trackTitle = new Widget.TrackTitle(null, _('Unknown Title'), 'track-title');
        this.trackArtist = new Widget.TrackTitle(_("by"), _('Unknown Artist'), 'track-artist');
        this.trackAlbum = new Widget.TrackTitle(_("from"), _('Unknown Album'), 'track-album');

        this.trackBox = new Widget.TrackBox(this.trackCoverContainer);
        this.trackBox.addInfo(this.trackTitle.box, 0);
        this.trackBox.addInfo(this.trackArtist.box, 1);
        this.trackBox.addInfo(this.trackAlbum.box, 2);
        if (this.showRating) {
            this.trackRating = new Widget.TrackRating(_("rating"), 0, 'track-rating', this);
            this.trackBox.addInfo(this.trackRating.box, 3);
        }

        this.addMenuItem(this.trackBox);

        this.trackBox.box.hide();
        this.trackBox.box.opacity = 0;
        this.trackBox.box.set_height(0);

        this._prevButton = new Widget.ControlButton('media-skip-backward',
            Lang.bind(this, function () { this._mediaServerPlayer.PreviousRemote(); }));
        this._playButton = new Widget.ControlButton('media-playback-start',
            Lang.bind(this, function () { this._mediaServerPlayer.PlayPauseRemote(); }));
        this._stopButton = new Widget.ControlButton('media-playback-stop',
            Lang.bind(this, function () { this._mediaServerPlayer.StopRemote(); }));
        this._stopButton.hide();
        this._nextButton = new Widget.ControlButton('media-skip-forward',
            Lang.bind(this, function () { this._mediaServerPlayer.NextRemote(); }));

        this.trackControls = new Widget.ControlButtons();
        this.trackControls.addButton(this._prevButton.actor);
        this.trackControls.addButton(this._playButton.actor);
        this.trackControls.addButton(this._stopButton.actor);
        this.trackControls.addButton(this._nextButton.actor);

        this.addMenuItem(this.trackControls);

        this._position = new Widget.SliderItem("0:00 / 0:00", "document-open-recent", 0);
        this._position.connect('value-changed', Lang.bind(this, function(item) {
            let time = item._value * this._songLength;
            this._position.setLabel(this._formatTime(time) + " / " + this._formatTime(this._songLength));
            this._wantedSeekValue = Math.round(time * 1000000);
            this._mediaServerPlayer.SetPositionRemote(this.trackObj, time * 1000000);
        }));
        this.addMenuItem(this._position);
        this._position.actor.hide();

        this._volume = new Widget.SliderItem(_("Volume"), "audio-volume-high", 0);
        this._volume.connect('value-changed', Lang.bind(this, function(item) {
            this._mediaServerPlayer.Volume = item._value;
        }));
        this.addMenuItem(this._volume);
        this._volume.actor.hide();

        this._getVolume();
        this._getIdentity();
        this._getDesktopEntry();
        this._getMetadata();
        this._getStatus();
        this._getPosition();
        if (this.showPlaylists) {
            this._getPlaylists();
            this._getActivePlaylist();
        }

        if (this._mediaServer.CanRaise) {
            this.playerTitle.connect('activate',
                Lang.bind(this, function () {
                    // If we have an application in the appSystem
                    // Bring it to the front else let the player decide
                    if (this._app)
                        this._app.activate_full(-1, 0);
                    else
                        this._mediaServer.RaiseRemote();
                    // Close the indicator
                    mediaplayerMenu.menu.close();
                })
            );
        }
        else {
            // Make the player title insensitive
            this.playerTitle.setSensitive(false);
            this.playerTitle.actor.remove_style_pseudo_class('insensitive');
        }

        if (this._mediaServer.CanQuit) {
            this.playerTitle.showButton();
        }

        this._prop.connectSignal('PropertiesChanged', Lang.bind(this, function(proxy, sender, [iface, props]) {
            if (props.Volume)
                this._setVolume(props.Volume.unpack());
            if (props.PlaybackStatus)
                this._setStatus(props.PlaybackStatus.unpack());
            if (props.Metadata)
                this._setMetadata(props.Metadata.deep_unpack());
            if (props.ActivePlaylist)
                this._setActivePlaylist(props.ActivePlaylist.deep_unpack());
        }));

        this._mediaServerPlayer.connectSignal('Seeked', Lang.bind(this, function(proxy, sender, [value]) {
            if (value > 0) {
                this._setPosition(value);
            }
            // Seek initiated by the position slider
            else if (this._wantedSeekValue > 0) {
                // Some broken gstreamer players (Banshee) reports always 0
                // when the track is seeked so we set the position at the
                // value we set on the slider
                this._setPosition(this._wantedSeekValue);
            }
            // Seek value send by the player
            else
                this._setPosition(value);

            this._wantedSeekValue = 0;
        }));
    },

    _getIdentity: function() {
        if (this._mediaServer.Identity) {
            this._identity = this._mediaServer.Identity;
            this._setIdentity();
        }
    },

    _getDesktopEntry: function() {
        let entry = this._mediaServer.DesktopEntry;
        let appSys = Shell.AppSystem.get_default();
        this._app = appSys.lookup_app(entry+".desktop");
        if (this._app) {
            let icon = this._app.create_icon_texture(16);
            this.playerTitle.setIcon(icon);
        }
    },

    _setActivePlaylist: function(playlist) {
        // Is there an active playlist ?
        if (playlist && playlist[0]) {
            this._currentPlaylist = playlist[1][0];
        }
        this._setPlaylists(null);
    },

    _getActivePlaylist: function() {
        this._setActivePlaylist(this._mediaServerPlaylists.ActivePlaylist);
    },

    _setPlaylists: function(playlists) {
        if (!playlists && this._playlists)
            playlists = this._playlists;

        if (playlists && playlists[0].length > 0) {
            this._playlists = playlists;
            if (!this._playlistsMenu) {
                this._playlistsMenu = new PopupMenu.PopupSubMenuMenuItem(_("Playlists"));
                this.addMenuItem(this._playlistsMenu);
            }
            let show = false;
            this._playlistsMenu.menu.removeAll();
            for (let p in this._playlists[0]) {
                let obj = this._playlists[0][p][0];
                let name = this._playlists[0][p][1];
                if (obj.toString().search('Video') == -1) {
                    let playlist = new Widget.PlaylistItem(name, obj);
                    playlist.connect('activate', Lang.bind(this, function(playlist) {
                        this._mediaServerPlaylists.ActivatePlaylistRemote(playlist.obj);
                    }));
                    if (obj == this._currentPlaylist)
                        playlist.setShowDot(true);
                    this._playlistsMenu.menu.addMenuItem(playlist);
                    show = true;
                }
            }
            if (!show)
                this._playlistsMenu.destroy();

        }
    },

    _getPlaylists: function() {
        this._mediaServerPlaylists.GetPlaylistsRemote(0, 100, "Alphabetical", false, Lang.bind(this, this._setPlaylists));
    },

    _setIdentity: function() {
        if (this._status)
            this.playerTitle.setLabel(this._identity + " - " + _(this._status));
        else
            this.playerTitle.setLabel(this._identity);
    },

    _setPosition: function(value) {
        // Player does not have a position property
        if (value == null && this._status != Status.STOP) {
            this.supportPosition = false;
            this._position.actor.hide();
        }
        else {
            this._currentTime = value / 1000000;
            this._updateTimer();
        }
    },

    _getPosition: function() {
        this._setPosition(this._mediaServerPlayer.Position);
    },

    _setMetadata: function(metadata) {
        // Pragha sends a metadata dict with one
        // value on stop
        if (metadata != null && Object.keys(metadata).length > 1) {
            this._currentTime = -1;
            if (metadata["mpris:length"]) {
                this._songLength = metadata["mpris:length"].unpack() / 1000000;
                this.supportPosition = true;
                if (this.showPosition && this._status != Status.STOP)
                    this._position.actor.show();
            }
            else {
                this._songLength = 0;
                this.supportPosition = false;
                this._position.actor.hide();
            }
            if (metadata["xesam:artist"])
                this.trackArtist.setText(metadata["xesam:artist"].deep_unpack());
            else
                this.trackArtist.setText(_("Unknown Artist"));
            if (metadata["xesam:album"])
                this.trackAlbum.setText(metadata["xesam:album"].unpack());
            else
                this.trackAlbum.setText(_("Unknown Album"));
            if (metadata["xesam:title"])
                this.trackTitle.setText(metadata["xesam:title"].unpack());
            else
                this.trackTitle.setText(_("Unknown Title"));

            if (metadata["xesam:url"])
                this.trackUrl = metadata["xesam:url"].unpack();
            else
                this.trackUrl = false;

            if (metadata["mpris:trackid"]) {
                this.trackObj = metadata["mpris:trackid"].unpack();
            }

            if (this.showRating) {
                let rating = 0;
                if (metadata["xesam:userRating"])
                    rating = (metadata["xesam:userRating"].deep_unpack() * 5);
                // Clementine
                if (metadata["rating"])
                    rating = metadata["rating"].deep_unpack();
                this.trackRating.setRating(rating);
                this.trackRating.showRating(rating);
            }

            let change = false;
            if (metadata["mpris:artUrl"]) {
                if (this.trackCoverFile != metadata["mpris:artUrl"].unpack()) {
                    this.trackCoverFile = metadata["mpris:artUrl"].unpack();
                    change = true;
                }
            }
            else {
                if (this.trackCoverFile != false) {
                    this.trackCoverFile = false;
                    change = true;
                }
            }

            if (change) {
                if (this.trackCoverFile) {
                    let cover_path = "";
                    // Distant cover
                    if (this.trackCoverFile.match(/^http/)) {
                        // hide current cover
                        this._hideCover();
                        // Copy the cover to a tmp local file
                        let cover = Gio.file_new_for_uri(decodeURIComponent(this.trackCoverFile));
                        // Don't create multiple tmp files
                        if (!this.trackCoverFileTmp)
                            this.trackCoverFileTmp = Gio.file_new_tmp('XXXXXX.mediaplayer-cover')[0];
                        // asynchronous copy
                        cover.read_async(null, null, Lang.bind(this, this._onReadCover));
                    }
                    // Local cover
                    else if (this.trackCoverFile.match(/^file/)) {
                        cover_path = decodeURIComponent(this.trackCoverFile.substr(7));
                        this._showCover(cover_path);
                    }
                }
                else
                    this._showCover(false);
            }
        }
    },

    _onReadCover: function(cover, result) {
        let inStream = cover.read_finish(result);
        let outStream = this.trackCoverFileTmp.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, null);
        outStream.splice_async(inStream, Gio.OutputStreamSpliceFlags.CLOSE_TARGET, 0, null, Lang.bind(this, this._onSavedCover));
    },

    _onSavedCover: function(outStream, result) {
        outStream.splice_finish(result, null);
        let cover_path = this.trackCoverFileTmp.get_path();
        this._showCover(cover_path);
    },

    _hideCover: function() {
        Tweener.addTween(this.trackCoverContainer, { opacity: 0,
            time: 0.3,
            transition: 'easeOutCubic',
        });
    },

    _showCover: function(cover_path) {
        Tweener.addTween(this.trackCoverContainer, { opacity: 0,
            time: 0.3,
            transition: 'easeOutCubic',
            onComplete: Lang.bind(this, function() {
                // Change cover
                if (! cover_path || ! GLib.file_test(cover_path, GLib.FileTest.EXISTS)) {
                    this.trackCover = new St.Icon({icon_name: "media-optical-cd-audio", icon_size: this.coverSize, icon_type: St.IconType.FULLCOLOR});
                }
                else {
                    this.trackCover = new St.Bin({style_class: 'track-cover'});
                    let coverTexture = new Clutter.Texture({filter_quality: 2, filename: cover_path});
                    let [coverWidth, coverHeight] = coverTexture.get_base_size();
                    this.trackCover.width = this.coverSize;
                    this.trackCover.height = coverHeight / (coverWidth / this.coverSize);
                    this.trackCover.set_child(coverTexture);
                }
                this.trackCoverContainer.set_child(this.trackCover);
                // Show the new cover
                Tweener.addTween(this.trackCoverContainer, { opacity: 255,
                    time: 0.3,
                    transition: 'easeInCubic'
                });
            })
        });
    },

    _toggleCover: function() {
        if (this.trackCover.has_style_class_name('track-cover')) {
            let factor = 2;
            let [coverWidth, coverHeight] = this.trackCover.get_size();
            if (coverWidth > this.coverSize)
                factor = 0.5;
            Tweener.addTween(this.trackCover, { height: coverHeight * factor, width: coverWidth * factor,
                time: 0.3,
                transition: 'easeInCubic'
            });
        }
    },

    _getMetadata: function() {
        this._setMetadata(this._mediaServerPlayer.Metadata);
    },

    _setVolume: function(value) {
        // Player does not have a volume property
        if (value == null)
            this.showVolume = false;

        if (this.showVolume) {
            if (value == 0)
                this._volume.setIcon("audio-volume-muted");
            if (value > 0)
                this._volume.setIcon("audio-volume-low");
            if (value > 0.30)
                this._volume.setIcon("audio-volume-medium");
            if (value > 0.80)
                this._volume.setIcon("audio-volume-high");
            this._volume.setValue(value);
        }
    },

    _getVolume: function() {
        this._setVolume(this._mediaServerPlayer.Volume);
    },

    _setStatus: function(status) {
        if (status != this._status) {
            this._status = status;
            if (this._status == Status.PLAY) {
                this._playButton.setIcon("media-playback-pause");
                this._startTimer();
            }
            else if (this._status == Status.PAUSE) {
                this._playButton.setIcon("media-playback-start");
                this._pauseTimer();
            }
            else if (this._status == Status.STOP) {
                this._playButton.setIcon("media-playback-start");
                this._stopTimer();
            }

            // Wait a little before changing the state
            // Some players are sending the stopped signal
            // when changing tracks
            Mainloop.timeout_add(1000, Lang.bind(this, this._refreshStatus));
        }
    },

    _refreshStatus: function() {
        if (this._status != Status.STOP) {
            if (this.trackBox.box.get_stage() && this.trackBox.box.opacity == 0) {
                this.trackBox.box.show();
                this.trackBox.box.set_height(-1);
                let [minHeight, naturalHeight] = this.trackBox.box.get_preferred_height(-1);
                this.trackBox.box.opacity = 0;
                this.trackBox.box.set_height(0);
                Tweener.addTween(this.trackBox.box,
                    { opacity: 255,
                      height: naturalHeight,
                      time: FADE_ANIMATION_TIME,
                      transition: 'easeOutQuad',
                      onComplete: function() {
                           this.trackBox.box.set_height(-1);
                      },
                      onCompleteScope: this
                    });
            }
            this._stopButton.show();
            if (this.showVolume)
                this._volume.actor.show();
            if (this.showPosition && this.supportPosition)
                this._position.actor.show();
        }
        else {
            if (this.trackBox.box.get_stage() && this.trackBox.box.opacity == 255) {
                Tweener.addTween(this.trackBox.box,
                    { opacity: 0,
                      height: 0,
                      time: FADE_ANIMATION_TIME,
                      transition: 'easeOutQuad',
                      onComplete: function() {
                           this.trackBox.box.hide();
                      },
                      onCompleteScope: this
                    });
            }
            this._stopButton.hide();
            this._volume.actor.hide();
            this._position.actor.hide();
        }
        this._setIdentity();
        this.emit('status-changed');
    },

    _getStatus: function() {
        this._setStatus(this._mediaServerPlayer.PlaybackStatus);
    },

    _updateTimer: function() {
        if (this.showPosition && this.supportPosition) {
            if (!isNaN(this._currentTime) && !isNaN(this._songLength) && this._currentTime > 0)
                this._position.setValue(this._currentTime / this._songLength);
            else
                this._position.setValue(0);
            this._position.setLabel(this._formatTime(this._currentTime) + " / " + this._formatTime(this._songLength));
        }
    },

    _startTimer: function() {
        if (this._status == Status.PLAY) {
            this._timeoutId = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._startTimer));
            this._currentTime += 1;
            this._updateTimer();
        }
    },

    _pauseTimer: function() {
        if (this._timeoutId != 0) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._updateTimer();
    },

    _stopTimer: function() {
        this._currentTime = 0;
        this._pauseTimer();
        this._updateTimer();
    },

    _formatTime: function(s) {
        let ms = s * 1000;
        let msSecs = (1000);
        let msMins = (msSecs * 60);
        let msHours = (msMins * 60);
        let numHours = Math.floor(ms/msHours);
        let numMins = Math.floor((ms - (numHours * msHours)) / msMins);
        let numSecs = Math.floor((ms - (numHours * msHours) - (numMins * msMins))/ msSecs);
        if (numSecs < 10)
            numSecs = "0" + numSecs.toString();
        if (numMins < 10 && numHours > 0)
            numMins = "0" + numMins.toString();
        if (numHours > 0)
            numHours = numHours.toString() + ":";
        else
            numHours = "";
        return numHours + numMins.toString() + ":" + numSecs.toString();
    },

    destroy: function() {
        this._stopTimer();
        PopupMenu.PopupMenuSection.prototype.destroy.call(this);
    }
});

const PlayerManager = new Lang.Class({
    Name: 'PlayerManager',

    _init: function(menu) {
        // the menu
        this.menu = menu;
        // players list
        this._players = {};
        // the DBus interface
        this._dbus = new DBusIface.DBus();
        // hide the menu by default
        if (!settings.get_boolean(MEDIAPLAYER_VOLUME_MENU_KEY) &&
            !settings.get_boolean(MEDIAPLAYER_RUN_DEFAULT))
                this.menu.actor.hide();
        // player DBus name pattern
        let name_regex = /^org\.mpris\.MediaPlayer2\./;
        // load players
        this._dbus.ListNamesRemote(Lang.bind(this,
            function(names) {
                for (n in names[0]) {
                    let name = names[0][n];
                    if (name_regex.test(name)) {
                        this._dbus.GetNameOwnerRemote(name, Lang.bind(this,
                            function(owner) {
                                this._addPlayer(name, owner);
                            }
                        ));
                    }
                }
            }
        ));
        // watch players
        this._dbus.connectSignal('NameOwnerChanged', Lang.bind(this,
            function(proxy, sender, [name, old_owner, new_owner]) {
                if (name_regex.test(name)) {
                    if (new_owner && !old_owner)
                        this._addPlayer(name, new_owner);
                    else if (old_owner && !new_owner)
                        this._removePlayer(name, old_owner);
                    else
                        this._changePlayerOwner(name, old_owner, new_owner);
                }
            }
        ));
    },

    // TODO: move to proper place
    _isInstance: function(busName) {
        // MPRIS instances are in the form
        // org.mpris.MediaPlayer2.name.instanceXXXX
        return busName.split('.').length > 4;
    },

    _addPlayer: function(busName, owner) {
        let position;
        if (this._players[owner]) {
            let prevName = this._players[owner]._busName;
            // HAVE:       ADDING:     ACTION:
            // master      master      reject, cannot happen
            // master      instance    upgrade to instance
            // instance    master      reject, duplicate
            // instance    instance    reject, cannot happen
            if (this._isInstance(busName) && !this._isInstance(prevName))
                this._players[owner]._busName = busName;
            else
                return;
        } else if (owner) {
            this._players[owner] = {player: new Player(busName, owner)};
            this._players[owner].signal = this._players[owner].player.connect('status-changed',
                Lang.bind(this, this._statusChanged));
            if (settings.get_boolean(MEDIAPLAYER_VOLUME_MENU_KEY))
                position = this.menu.menu.numMenuItems - 2;
            else
                position = 0;
            this.menu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), position)
            this.menu.menu.addMenuItem(this._players[owner].player, position);
            this.menu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), position)
            this.menu.actor.show();
        }
    },

    _removePlayer: function(busName, owner) {
        if (this._players[owner]) {
            this._players[owner].player.disconnect(this._players[owner].signal);
            this._players[owner].player.destroy();
            delete this._players[owner];
            if (!settings.get_boolean(MEDIAPLAYER_VOLUME_MENU_KEY) &&
                !settings.get_boolean(MEDIAPLAYER_RUN_DEFAULT) &&
                this._nbPlayers() == 0)
                    this.menu.actor.hide();
        }
        this._refreshStatus();
    },

    _changePlayerOwner: function(busName, oldOwner, newOwner) {
        if (this._players[oldOwner]) {
            this._players[newOwner] = this._players[oldOwner];
            delete this._players[oldOwner];
        }
        this._refreshStatus();
    },

    _nbPlayers: function() {
        return Object.keys(this._players).length;
    },

    _statusChanged: function(player) {
        let owner = player._owner;
        let status = player._status;
        this._players[owner].status = status;
        this._refreshStatus();
    },

    _refreshStatus: function() {
        // Display current status in the top panel
        if (mediaplayerMenu instanceof MediaplayerStatusButton) {
            let globalStatus = false;
            if (this._nbPlayers() == 0) {
                globalStatus = Status.RUN;
            }
            else {
                for (let owner in this._players) {
                    if (this._players[owner].status == Status.PLAY)
                        globalStatus = this._players[owner].status;
                    if (this._players[owner].status == Status.PAUSE && !globalStatus)
                        globalStatus = this._players[owner].status;
                }
                if (!globalStatus)
                    globalStatus = Status.STOP;
            }
            mediaplayerMenu.setState(globalStatus);
        }
    },

    next: function() {
        // Ignore stopped or paused players
        for (let owner in this._players) {
            if (this._players[owner].status == Status.PLAY)
                this._players[owner].player._mediaServerPlayer.NextRemote();
        }
    },

    previous: function() {
        // Ignore stopped or paused players
        for (let owner in this._players) {
            if (this._players[owner].status == Status.PLAY)
                this._players[owner].player._mediaServerPlayer.PreviousRemote();
        }
    },

    playPause: function() {
        // Ignore stopped players
        for (let owner in this._players) {
            if (this._players[owner].status == Status.PLAY ||
                this._players[owner].status == Status.PAUSE)
                this._players[owner].player._mediaServerPlayer.PlayPauseRemote();
        }

    },

    destroy: function() {
        for (let owner in this._players)
            this._removePlayer(null, owner);
    }
});

const MediaplayerStatusButton = new Lang.Class({
    Name: 'MediaplayerStatusButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "mediaplayer");

        // get the default player
        this._default = Shell.AppSystem.get_default().lookup_app(
            Gio.app_info_get_default_for_type('audio/x-vorbis+ogg', false).get_id()
        );
        settings.connect("changed::" + MEDIAPLAYER_RUN_DEFAULT, Lang.bind(this, function() {
            if (settings.get_boolean(MEDIAPLAYER_RUN_DEFAULT)) {
                this.actor.show();
            }
            else if (playerManager._nbPlayers() == 0) {
                this.actor.hide();
            }
        }));

        this._iconBox = new St.BoxLayout();
        this._iconIndicator = new St.Icon({icon_name: 'audio-x-generic',
                                           style_class: 'system-status-icon'});
        this._iconState = new St.Icon({icon_name: 'system-run',
                                       style_class: 'status-icon'})
        this._iconStateBin = new St.Bin({child: this._iconState,
                                         y_align: St.Align.END});

        this._iconBox.add(this._iconIndicator);
        this._iconBox.add(this._iconStateBin);
        this.actor.add_actor(this._iconBox);
        this.actor.add_style_class_name('panel-status-button');
        this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
    },

    _onScrollEvent: function(actor, event) {
        let direction = event.get_scroll_direction();

        if (direction == Clutter.ScrollDirection.DOWN)
            playerManager.previous();
        else if (direction == Clutter.ScrollDirection.UP)
            playerManager.next();
    },

    // Override PanelMenu.Button._onButtonPress
    _onButtonPress: function(actor, event) {
        let button = event.get_button();

        if (button == 2)
            playerManager.playPause();
        else {
            if (settings.get_boolean(MEDIAPLAYER_RUN_DEFAULT) &&
                this._default && playerManager._nbPlayers() == 0) {
                    this._default.activate_full(-1, 0);
                    return;
            }

            if (!this.menu)
                return;

            this.menu.toggle();
        }
    },

    setState: function(state) {
        if (state == Status.PLAY)
            this._iconState.icon_name = "media-playback-start";
        else if (state == Status.PAUSE)
            this._iconState.icon_name = "media-playback-pause";
        else if (state == Status.STOP)
            this._iconState.icon_name = "media-playback-stop";
        else if (state == Status.RUN)
            this._iconState.icon_name = "system-run";
    }
});

function init() {
    Lib.initTranslations(Me);
    settings = Lib.getSettings(Me);
}

function enable() {
    if (settings.get_boolean(MEDIAPLAYER_VOLUME_MENU_KEY)) {
        // wait for the volume menu
        while(Main.panel._statusArea['volume']) {
            mediaplayerMenu = Main.panel._statusArea['volume'];
            break;
        }
    }
    else {
        mediaplayerMenu = new MediaplayerStatusButton();
        Main.panel.addToStatusArea('mediaplayer', mediaplayerMenu);
    }
    playerManager = new PlayerManager(mediaplayerMenu);

    settings.connect("changed::" + MEDIAPLAYER_VOLUME_MENU_KEY, function() {
        disable();
        enable();
    });
}

function disable() {
    playerManager.destroy();
    if (mediaplayerMenu instanceof MediaplayerStatusButton)
        mediaplayerMenu.destroy();
}

