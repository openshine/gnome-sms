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
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const DBus = imports.dbus;

/* Global vars */
const CONTACT_ICON_SIZE = 40;
let smsButton;
let extension = imports.misc.extensionUtils.getCurrentExtension();

const ModemManagerIface = {
    name: 'org.freedesktop.ModemManager',
    properties: [],
    methods: [
        { name: 'EnumerateDevices', inSignature: '',  outSignature: 'ao'},
    ],
    signals: []
};

const SMSIface = {
    name: 'org.freedesktop.ModemManager.Modem.Gsm.SMS',
    properties: [],
    methods: [
        { name: 'List', inSignature: '',  outSignature: 'aa{sv}'},
    ],
    signals: []
};
 
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
        this._iconStateBin = new St.Bin({child: this._iconIndicator});

        this._iconBox.add(this._iconStateBin);
        this.actor.add_actor(this._iconBox);
        this.actor.add_style_class_name('panel-status-button');
    },

    _createMainPanel: function () {
        let smsBox =  new St.BoxLayout({ style_class: 'gsms-sms-box'});
        this.menu.addActor(smsBox);

        this._contactsBox = new ContactsBox ();
        this._messageDisplay = new MessageDisplay ();

        smsBox.add_actor (this._contactsBox);
        smsBox.add_actor (this._messageDisplay);

        //this._proxy.EnumerateDevicesRemote(Lang.bind(this, this._on_get_modems));
        let contacts = [new Contact ("Cesar Garcia"), new Contact ("Roberto Majadas Lopez")];
        this._messageDisplay.load_messages (contacts[0]);
        this._contactsBox.load_contacts (contacts);
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
    },
});

const ContactsBox = new Lang.Class({
    Name: 'ContactsBox',
    Extends: St.BoxLayout,

    _init: function () {
        this.parent ({ vertical:true,
                       style_class: 'gsms-contacts-box'});

        this._searchEntry = new St.Entry({ name: 'searchEntry',
                                     style_class: 'gsms-search-entry',
                                     hint_text: _("Type to search..."),
                                     track_hover: true,
                                     can_focus: true });
        this._searchEntry.set_secondary_icon (new St.Icon({ style_class: 'search-entry-icon',
                                                      icon_name: 'edit-find',
                                                      icon_type: St.IconType.SYMBOLIC }));

        this.add_actor (this._searchEntry);

        this._contactsBox = new St.BoxLayout ({vertical: true, style_class: 'gsms-contacts-list'});
        this.add_actor (this._contactsBox);
    },

    load_contacts: function (contacts) {
        for (var i = 0; i < contacts.length; i++) {
            var contact = contacts[i];
            this._contactsBox.add_actor (new ContactButton (contact));
        }
    }
});

const Contact = new Lang.Class ({
    Name: 'Contact',

    _init: function (name) {
        this.name = name;
    },

    get_icon: function (name) {
        let icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                   icon_size: CONTACT_ICON_SIZE,
                                   style_class: 'gsms-contact-icon' });
        icon.icon_name = 'avatar-default';

        return icon;
    }
});

const ContactButton = new Lang.Class({
    Name: 'ContactButton',
    Extends: St.Button,

    _init: function(contact) {
        this.parent ({x_align: St.Align.START});
        this.style_class = 'gsms-contact';

        this.contact = contact;

        let child = new St.BoxLayout ({style_class: 'gsms-contact-button-box'});
        this.set_child (child);
 
        this._details = new St.BoxLayout({ style_class: 'gsms-contact-details',
                                           vertical: true });
        this._name = new St.Label ({style_class: 'gsms-contact-details-label'});
        this._name.set_text (this.contact.name);
        this._details.add (this._name, {expand: true, y_fill: true, y_align: St.Align.MIDDLE});

        child.add (this.contact.get_icon());
        child.add_actor (this._details);

        this.connect ('clicked', Lang.bind(this, this._onClick));
    },

    _onClick: function () {
        global.log ("clicked");
    }
});

const MessageDisplay = new Lang.Class({
    Name: 'MessageDisplay',
    Extends: St.BoxLayout,

    _init: function(name) {
        this.parent ({vertical: true});
        this.style_class = 'gsms-message-display';

        this._senderBox = new St.BoxLayout ({style_class: 'gsms-conversation-sender'});
        this.add_actor (this._senderBox, {x_align: St.Align.MIDDLE});
        
        let scrollview = new St.ScrollView ({ style_class: 'gsms-message-display-scrollview',
                                              vscrollbar_policy: Gtk.PolicyType.NEVER,
                                              hscrollbar_policy: Gtk.PolicyType.AUTOMATIC });

        this._conversationDisplay = new St.BoxLayout ({vertical:true, style_class: 'gsms-conversation-display'});

        this._entry = new St.Entry({ style_class: 'gsms-message-reply-entry',
                                     hint_text: _("Type your answer..."),
                                     track_hover: true,
                                     can_focus: true });
        scrollview.add_actor (this._conversationDisplay);
        this.add (scrollview);
        this.add_actor (this._entry);
    },

    load_messages: function (contact) {
        this._load_sender_info (contact);

        let message = new MessageView ("incoming", "Hola que tal me llamo cesar y esto es una prueba de un texto ver como me las apaño para pintarlo todo seguido y que quede bien");
        this._conversationDisplay.add_actor (message);
        message = new MessageView ("outgoing", "Hola que tal me llamo cesar y esto es una prueba de un texto ver como me las apaño para pintarlo todo seguido y que quede bien");
        this._conversationDisplay.add_actor (message);
    },

    _load_sender_info: function (contact) {
        this._senderBox.remove_all_children();
        
        let details = new St.BoxLayout({ style_class: 'gsms-contact-details',
                                         vertical: true });
        let name = new St.Label ({style_class: 'gsms-contact-details-label'});
        name.set_text (contact.name);
        details.add (name, {expand: true, y_align: St.Align.MIDDLE});

        this._senderBox.add (contact.get_icon());
        this._senderBox.add_actor (details);


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
            this.add_actor (this._text);
        }
        else {
            this._text.style_class = 'gsms-message-outgoing';

            this._tag_icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                            icon_size: 12,
                                            gicon: Gio.icon_new_for_string(extension.path + "/right-arrow.png"),
                                            });

            this.add_actor (this._text);
            this.add (this._tag_icon);
        }
        this._tag_icon.style_class ='gsms-message-tag';

        this.set_text (text);
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

