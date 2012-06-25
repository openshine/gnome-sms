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
const PopupMenu = imports.ui.popupMenu;

const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const NetworkManager = imports.gi.NetworkManager;

const Lang = imports.lang;
const DBus = imports.dbus;
const Signals = imports.signals;
const Mainloop = imports.mainloop;

const ContactSystem = imports.gi.Shell.ContactSystem;

/* Global vars */
const CONTACT_ICON_SIZE = 40;
let smsButton;
let extension = imports.misc.extensionUtils.getCurrentExtension();

let contactSystem = ContactSystem.get_default ();
let goa_contacts;

const ModemManagerDBusIface = {
    name: 'org.freedesktop.ModemManager',
    properties: [],
    methods: [
        { name: 'EnumerateDevices', inSignature: '',  outSignature: 'ao' },
    ],
    signals: [
        { name: 'DeviceAdded', inSignature: 'o' },
        { name: 'DeviceRemoved', inSignature: 'o' },
    ]
};

const ModemDBusIface = {
    name: 'org.freedesktop.ModemManager.Modem',
    properties: [
        { name: 'Type', signature: 'u', access: 'read' },
        { name: 'State', signature: 'u', access: 'read' },
    ],
    methods: [
        { name: 'Enable', inSignature: 'b', outSignature: '' },
    ],
    signals: []
};

const SmsDBusIface = {
    name: 'org.freedesktop.ModemManager.Modem.Gsm.SMS',
    properties: [],
    methods: [
        { name: 'List', inSignature: '',  outSignature: 'aa{sv}' },
        { name: 'Get', inSignature: 'i', outSignature: 'a{sv}' },
    ],
    signals: [
        { name: 'SmsReceived', inSignature: 'ib' },
        { name: 'Completed', inSignature: 'ib' },
    ]
};
 
let ModemManagerDBus = DBus.makeProxyClass (ModemManagerDBusIface);
let ModemDBus = DBus.makeProxyClass (ModemDBusIface);
let SmsDBus = DBus.makeProxyClass (SmsDBusIface);

const SmsApplet = new Lang.Class({
    Name: 'SmsApplet',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "sms");

        this._SmsList = {};

        this._proxy = new ModemManagerDBus (DBus.system, 'org.freedesktop.ModemManager', '/org/freedesktop/ModemManager');

        this._createMainButton();
        this._createMainPanel();

        this._loadDevices();
        this._proxy.connect ('DeviceAdded', Lang.bind (this, this._onDeviceAdded));
        this._proxy.connect ('DeviceRemoved', Lang.bind (this, this._onDeviceRemoved));
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
        let mainBox =  new St.BoxLayout({ style_class: 'gsms-main-box',
                                          vertical: true });
        this.menu.addActor(mainBox);

        this._deviceSelector = new DeviceSelector ();

        let smsBox =  new St.BoxLayout({ style_class: 'gsms-sms-box'});

        this._contactList = new ContactList();
        this._contactList.connect ('selected-contact', Lang.bind (this, this._onSelectedContact));
        this._messageDisplay = new MessageDisplay ();

        smsBox.add_actor (this._contactList);
        smsBox.add_actor (this._messageDisplay);

        mainBox.add_actor (this._deviceSelector);
        mainBox.add_actor (smsBox);
    },

    _onDeviceRemoved: function (path) {
        this._loadDevices ();
    },

    _onDeviceAdded: function (path) {
        this._loadDevices ();
    },

    _loadDevices: function () {
        this._proxy.EnumerateDevicesRemote(Lang.bind(this, this._onGetModems));
    },

    _onGetModems: function (modems) {
        if (modems.length > 0) {
            this._modem_path = modems[0];
            global.log ("MODEM: " + this._modem_path);
            let modem_proxy = new ModemDBus (DBus.system, 'org.freedesktop.ModemManager', this._modem_path);
            global.log ("TYPE: " + modem_proxy.Type);
            global.log ("STATE: " + modem_proxy.State);
            modem_proxy.EnableRemote (true, Lang.bind (this, this._onModemEnabled));
        }
    },

    _onModemEnabled: function () {
        global.log ("MODEM ENABLED");
        let sms_proxy = new SmsDBus (DBus.system, 'org.freedesktop.ModemManager', this._modem_path);
        sms_proxy.ListRemote (Lang.bind (this, this._onSmsList));
        sms_proxy.connect ('SmsReceived', Lang.bind (this, this._onSmsReceived));
        sms_proxy.connect ('Completed', Lang.bind (this, this._onSmsReceived));
    },

    _onSmsReceived: function (id, complete) {
        if (complete) {
            sms_proxy.ListRemote (Lang.bind (this, this._onSmsList));
        }
    },

    _onSmsList: function (list) {
        this._SmsList= {};
        if (list) {
            for (let i in list) {
                let sms = list[i];

                let phone = this._normalize (sms.number);
                if (!(phone in this._SmsList)) {
                    this._SmsList[phone] = [];
                }

                let message = new Message (phone, sms.timestamp, sms.text);
                this._SmsList[phone].push (message);
            }
        }
        this._reloadInterface ();
    },

    _normalize: function (phone) {
        return phone;
    },

    _reloadInterface: function () {
        this._contactList.loadContacts (this._SmsList);
        if (this._selectedContact) {
            this._onSelectedContact (null, this._selectedContact);
        }
    },

    _onSelectedContact: function (src, contact) {
        this._selectedContact = contact;
        this._messageDisplay.clear ();
        for (let phone in this._SmsList) {
            if (phone == contact.phone) {
                this._messageDisplay.loadMessages (contact, this._SmsList[phone]);
            }
        }
    }
});

const DeviceSelector = new Lang.Class ({
    Name: 'DeviceSelector',
    Extends: St.Button,

    _init: function () {
        this.parent ({ style_class: 'gsms-device-selector' });


    },
});

const ContactList = new Lang.Class({
    Name: 'ContactList',
    Extends: St.BoxLayout,

    _init: function () {
        this.parent ({ vertical:true,
                       style_class: 'gsms-contact-list'});

        this._searchEntry = new St.Entry({ name: 'searchEntry',
                                     style_class: 'gsms-search-entry',
                                     hint_text: _("Type to search..."),
                                     track_hover: true,
                                     can_focus: true });
        this._searchEntry.set_secondary_icon (new St.Icon({ style_class: 'search-entry-icon',
                                                      icon_name: 'edit-find',
                                                      icon_type: St.IconType.SYMBOLIC }));

        this.add_actor (this._searchEntry);

        this._contactsBox = new St.BoxLayout ({vertical: true, style_class: 'gsms-contacts-box'});

        let scrollview = new St.ScrollView ({ style_class: 'gsms-contact-list-scrollview',
                                              vscrollbar_policy: Gtk.PolicyType.NEVER,
                                              hscrollbar_policy: Gtk.PolicyType.AUTOMATIC });
        scrollview.add_actor (this._contactsBox); 
        this.add (scrollview, {expand: true});
    },

    loadContacts: function (smsList) {
        this._smsList = smsList;

        for (let phone in this._smsList) {
            let contact = new Contact (phone);
            let contactButton = new ContactButton (contact);
            contactButton.connect ('clicked', Lang.bind (this, this._onContactButtonClicked));
            this._contactsBox.add_actor (contactButton);
        }
    },

    _onContactButtonClicked: function (button) {
        this.emit ('selected-contact', button.contact);
    }
});
Signals.addSignalMethods(ContactList.prototype);

const Message = new Lang.Class ({
    Name: 'Message',

    _init: function (phone, date, text) {
        this.phone = phone;
        this.date = date;
        this.text = text;
    },
});

const Contact = new Lang.Class ({
    Name: 'Contact',

    _init: function (phone) {
        this.name = phone;
        this.phone = phone;
        this.avatar = null;


        for (let i = 0; i < goa_contacts.length; i++) {
            let contact = contactSystem.get_individual(goa_contacts[i]);
            let numbers = contact.phone_numbers;
            for (let number in numbers) {
                //global.log ("NAME: " + contact.alias + " - PHONE: " + number);
                if (number == phone && contact.alias) {
                    this.name = goa_contact.alias;
                    this.avatar = goa_contact.avatar;
                }
            }
        }
    },

    getIcon: function (name) {
        let icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                   icon_size: CONTACT_ICON_SIZE,
                                   style_class: 'gsms-contact-icon' });
        if (this.avatar) {
            icon.gicon = this.avatar;
        }
        else {
            icon.icon_name = 'avatar-default';
        }

        return icon;
    },
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

        child.add (this.contact.getIcon());
        child.add_actor (this._details);
    },
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

    clear: function () {
        this._conversationDisplay.remove_all_children();
    },

    loadMessages: function (contact, messages) {
        this._loadSenderInfo (contact);

        for (let i in messages) {
            let message = messages[i];
            let messageView = new MessageView ("incoming", message);
            this._conversationDisplay.add_actor (messageView);
        }

        //message = new MessageView ("outgoing", "Hola que tal me llamo cesar y esto es una prueba de un texto ver como me las apaño para pintarlo todo seguido y que quede bien");
        //this._conversationDisplay.add_actor (message);
    },

    _loadSenderInfo: function (contact) {
        this._senderBox.remove_all_children();

        let details = new St.BoxLayout({ style_class: 'gsms-contact-details',
                                         vertical: true });
        let name = new St.Label ({style_class: 'gsms-contact-details-label'});
        name.set_text (contact.phone);
        details.add (name, {expand: true, y_align: St.Align.MIDDLE});

        this._senderBox.add (contact.getIcon());
        this._senderBox.add_actor (details);


    }
});

const MessageView = new Lang.Class({
    Name: 'MessageView',
    Extends: St.BoxLayout,

    _init: function(direction, message) {
        this.parent ();
        this.style_class = 'gsms-message';

        this._text = new St.Label ();
        this._text.clutter_text.line_wrap = true;
        this._text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
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

        this.set_text (message.text);
    },

    set_text: function (text) {
        this._text.set_text (text);
    }
});

function init() {
}

function enable() {
    // HACK. Shell.ContactSystem takes some seconds to load, so we'll have to wait for it
    // before initalizing this extension.
    Mainloop.timeout_add (5000, function () {
        goa_contacts = contactSystem.initial_search (['']);
        let smsApplet = new SmsApplet ();
        Main.panel.addToStatusArea('sms', smsApplet);
    });
}

function disable() {
    smsButton.destroy();
}

