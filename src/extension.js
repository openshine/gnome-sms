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

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const DBus = imports.dbus;

/* Global vars */
const ICON_SIZE = 40;
let smsButton;
let extension = imports.misc.extensionUtils.getCurrentExtension();

const ModemManagerIface = {
    name: 'org.freedesktop.ModemManager',
    properties: [],
    methods: [
        { name: 'EnumerateDevices', inSignature: '',  outSignature: 'ao'},
    ],
    signals: []
}

const SMSIface = {
    name: 'org.freedesktop.ModemManager.Modem.Gsm.SMS',
    properties: [],
    methods: [
        { name: 'List', inSignature: '',  outSignature: 'aa{sv}'},
    ],
    signals: []
};
 ;
 
let ModemManager = DBus.makeProxyClass (ModemManagerIface);
let SMS = DBus.makeProxyClass (SMSIface);

const SmsButton = new Lang.Class({
    Name: 'SmsButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "sms");

        this._proxy = new ModemManager (DBus.system, 'org.freedesktop.ModemManager', '/org/freedesktop/ModemManager');

        this._createMainButton();
        this._createMainPanel();
    },

    _createMainButton: function () {
        this._iconBox = new St.BoxLayout();
        this._iconIndicator = new St.Icon({icon_name: 'phone',
            style_class: 'system-status-icon'});
        this._iconStateBin = new St.Bin({child: this._iconIndicator,
            y_align: St.Align.END});

        this._iconBox.add(this._iconStateBin);
        this.actor.add_actor(this._iconBox);
        this.actor.add_style_class_name('panel-status-button');
    },

    _createMainPanel: function () {
        let mainBox = new St.BoxLayout({ vertical: true,
                                         style_class: 'gsms-main-box' });
        this.menu.addActor(mainBox);

        let searchBar = new St.BoxLayout({ style_class: 'gsms-search-box'});
        let smsBox =  new St.BoxLayout({ style_class: 'gsms-sms-box'});
        mainBox.add_actor(searchBar, { expand: false, x_fill: false });
        mainBox.add_actor(smsBox, { expand: false, x_fill: false });

        this._contactsBox =  new St.BoxLayout({ vertical:true,
                                                style_class: 'gsms-sms-contacts-box'});
        this._messageDisplay = new MessageDisplay ();
        smsBox.add_actor (this._contactsBox);
        smsBox.add_actor (this._messageDisplay);

        this._entry = new St.Entry({ name: 'searchEntry',
                                     hint_text: _("Type to search..."),
                                     track_hover: true,
                                     can_focus: true });
        this._entry.set_secondary_icon (new St.Icon({ style_class: 'search-entry-icon',
                                                      icon_name: 'edit-find',
                                                      icon_type: St.IconType.SYMBOLIC }));
        searchBar.add_actor (this._entry);

        this._contactsBox.add_actor (new ContactInfo ("César García"));
        this._contactsBox.add_actor (new ContactInfo ("Roberto Majadas Lopez"));
        //this._proxy.EnumerateDevicesRemote(Lang.bind(this, this._on_get_modems));
    },

    _on_get_modems: function (modems) {
        if (modems.length > 0) {
            let path = modems[0];
            global.log ("----: " + modems);
            global.log ("PATH: " + path);
            let sms_proxy = new SMS (DBus.system, 'org.freedesktop.ModemManager', path);
            sms_proxy.ListRemote (Lang.bind (this, this._on_sms_list));
        }
    },

    _on_sms_list: function (list) {
        global.log (list);
    }
});

const ContactInfo = new Lang.Class({
    Name: 'ContactInfo',
    Extends: St.BoxLayout,

    _init: function(name) {
        this.parent ();
        this.style_class = 'gsms-contact';

        this._icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                    icon_size: ICON_SIZE,
                                    style_class: 'gsms-contact-icon' });
        this.add (this._icon, { x_fill: true,
                                y_fill: true,
                                x_align: St.Align.START,
                                y_align: St.Align.MIDDLE });

        this._details = new St.BoxLayout({ style_class: 'gsms-contact-details',
                                           vertical: true });
        this.add_actor (this._details, { x_fill: true,
                                         y_fill: true,
                                         x_align: St.Align.START,
                                         y_align: St.Align.MIDDLE });

        this._name = new St.Label ({style_class: 'gsms-contact-details-label'});
        this._details.add (this._name, { x_fill: false,
                                         y_fill: true,
                                         x_align: St.Align.START,
                                         y_align: St.Align.MIDDLE });

        if (name) {
            this.set_name (name);
            this.set_picture ();
        }
    },

    set_picture: function () {
        this._icon.icon_name = 'avatar-default';
    },

    set_name: function (name) {
        this._name.set_text (name);
    }
});

const MessageDisplay = new Lang.Class({
    Name: 'MessageDisplay',
    Extends: St.BoxLayout,

    _init: function(name) {
        this.parent ({vertical: true});
        this.style_class = 'gsms-message-display';

        let message = new MessageView ("incoming", "Hola que tal me llamo cesar y esto es una prueba de un texto largo a ver como me las apaño para pintarlo todo seguido y que quede bien");
        this.add_actor (message, { x_fill: false,
                                   y_fill: false,
                                   x_align: St.Align.START,
                                   y_align: St.Align.MIDDLE });

        message = new MessageView ("outgoing", "Hola que tal me llamo cesar y esto es una prueba de un texto largo a ver como me las apaño para pintarlo todo seguido y que quede bien");
        this.add_actor (message, { x_fill: false,
                                   y_fill: false,
                                   x_align: St.Align.START,
                                   y_align: St.Align.MIDDLE });
    }
});

const MessageView = new Lang.Class({
    Name: 'MessageView',
    Extends: St.BoxLayout,

    _init: function(direction, text) {
        this.parent ();
        this.style_class = 'gsms-message';

        this._text = new St.Label ();
        this._text.clutter_text.line_wrap = true;
        this._text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
        this._text.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        if (direction == 'incoming') {
            this._text.style_class ='gsms-message-incoming';

            this._tag_icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                            icon_size: 12,
                                            gicon: Gio.icon_new_for_string(extension.path + "/left-arrow.png"),
                                            });

            this.add (this._tag_icon);
            this.add_actor (this._text, { expand: true, x_fill: true, y_fill: false });
        }
        else {
            this._text.style_class = 'gsms-message-outgoing';

            this._tag_icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                            icon_size: 12,
                                            gicon: Gio.icon_new_for_string(extension.path + "/right-arrow.png"),
                                            });

            this.add_actor (this._text, { expand: true, x_fill: true, y_fill: false });
            this.add (this._tag_icon);
        }
        this._tag_icon.style_class ='gsms-message-tag';

        if (text) {
            this.set_text (text);
        }
    },

    set_text: function (text) {
        this._text.set_text (text);
    }
});

function init() {
}

function enable() {
    smsButton = new SmsButton();
    Main.panel.addToStatusArea('sms', smsButton);
}

function disable() {
    smsButton.destroy();
}

