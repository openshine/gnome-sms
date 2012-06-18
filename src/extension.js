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
const Lang = imports.lang;
const St = imports.gi.St;
const DBus = imports.dbus;

/* Global vars */
let smsButton;

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
                                         style_class: 'sms-box' });
        this._searchBar = new St.BoxLayout({ style_class: 'search-box'});
        this._smsDisplay =  new St.BoxLayout({ style_class: 'sms-display-box'});
        mainBox.add_actor(this._searchBar, { expand: false, x_fill: false });
        mainBox.add_actor(this._smsDisplay, { expand: false, x_fill: false });
        this.menu.addActor(mainBox);

        this._entry = new St.Entry({ name: 'searchEntry',
                                     hint_text: _("Type to search..."),
                                     track_hover: true,
                                     can_focus: true });
        this._entry.set_secondary_icon (new St.Icon({ style_class: 'search-entry-icon',
                                                      icon_name: 'edit-find',
                                                      icon_type: St.IconType.SYMBOLIC }));
        this._searchBar.add_actor (this._entry);

        this._proxy.EnumerateDevicesRemote(Lang.bind(this, this._on_get_modems));
    },

    _on_get_modems: function (modems) {
        let path = modems[0];
        let sms_proxy = new SMS (DBus.system, 'org.freedesktop.ModemManager', path);
        sms_proxy.ListRemote (Lang.bind (this, this._on_sms_list));
    },

    _on_sms_list: function (list) {
        global.log (list);
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

