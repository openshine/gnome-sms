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
const MessageTray = imports.ui.messageTray;
const ModalDialog = imports.ui.modalDialog;

const St = imports.gi.St;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Pango = imports.gi.Pango;
const Clutter = imports.gi.Clutter;
const NetworkManager = imports.gi.NetworkManager;

const GnomeSms = imports.gi.GnomeSms;

const Lang = imports.lang;
const Signals = imports.signals;
const Cairo = imports.cairo;

const PropertiesIface = <interface name="org.freedesktop.DBus.Properties">
    <signal name="MmPropertiesChanged">
        <arg type="s" direction="out" />
        <arg type="a{sv}" direction="out" />
    </signal>
</interface>;
const PropertiesDBus = Gio.DBusProxy.makeProxyWrapper(PropertiesIface);

const ModemManagerDBusIface = <interface name="org.freedesktop.ModemManager">
    <method name="EnumerateDevices">
        <arg type="ao" direction="out" />
    </method>
    <signal name="DeviceAdded">
        <arg type="o" direction="out" />
    </signal>
    <signal name="DeviceRemoved">
       <arg type="o" direction="out" />
    </signal>
</interface>;
const ModemManagerDBus = Gio.DBusProxy.makeProxyWrapper (ModemManagerDBusIface);

const ModemDBusIface = <interface name="org.freedesktop.ModemManager.Modem">
    <method name="Enable">
        <arg type="b" direction="in" />
    </method>
    <property name="Type" type="u" access="read" />
    <property name="Enabled" type="b" access="read" />
</interface>;
const ModemDBus = Gio.DBusProxy.makeProxyWrapper (ModemDBusIface);

const SmsDBusIface = <interface name="org.freedesktop.ModemManager.Modem.Gsm.SMS">
    <method name="List">
        <arg type="aa{sv}" direction="out" />
    </method>
    <method name="Get">
        <arg type="i" direction="in" />
        <arg type="a{sv}" direction="out" />
    </method>
    <method name="Send">
        <arg type="{sv}" direction="in" />
        <arg type="au" direction="out" />
    </method>
    <signal name="SmsReceived">
        <arg type="i" direction="out" />
        <arg type="b" direction="out" />
    </signal>
    <signal name="Completed">
        <arg type="i" direction="out" />
        <arg type="b" direction="out" />
    </signal>
</interface>;
const SmsDBus = Gio.DBusProxy.makeProxyWrapper (SmsDBusIface);

/* Global vars */
const CONTACT_ICON_SIZE = 40;
const MAX_RESET_ATTEMPTS = 5;
const MIN_CONTACT_SEARCH_LENGTH = 2;
const MAX_CONTACT_SEARCH_DISPLAY = 10;
const APP_NAME = "Gnome SMS";
const ENCODING_GSM7 = 'gsm7';
const ENCODING_UCS2 = 'ucs2';
const MAX_SMS_LENGTH_GSM7 = 155;
const MAX_SMS_LENGTH_UCS2 = 70;

let extension = imports.misc.extensionUtils.getCurrentExtension();
let smsButton;
let smsHelper;

/* DBus proxy objects */
let properties_proxy;
let modem_manager_proxy;
let modem_proxy;
let sms_proxy;
 
const SmsApplet = new Lang.Class({
    Name: 'SmsApplet',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "sms");

        this.actor.hide();

        this._resetAttempt = 0;
        this._SmsList = {};
        this._notificationSystem = new NotificationSystem();

        smsHelper = new GnomeSms.Helper ();
        smsHelper.connect ('update_contacts', Lang.bind (this, this._onUpdateContacts));
        smsHelper.read_individuals();

        modem_manager_proxy = new ModemManagerDBus (Gio.DBus.system, 'org.freedesktop.ModemManager', '/org/freedesktop/ModemManager');

        this._createMainButton();
        this._createMainPanel();

        this._loadDevices();

        modem_manager_proxy.connectSignal ('DeviceAdded', Lang.bind (this, function (proxy, sender, [path]) {
            this._onDeviceAdded (path);
        }));
        modem_manager_proxy.connectSignal ('DeviceRemoved', Lang.bind (this, function (proxy, sender, [path]) {
            this._onDeviceRemoved (path);
        }));
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
        this._messageDisplay.hide();

        smsBox.add (this._contactList, { x_fill: true, y_fill: true, expand: false });
        smsBox.add (this._messageDisplay, { x_fill: true, y_fill: true, expand: true });

        mainBox.add (this._deviceSelector);
        mainBox.add (smsBox, { x_fill: true, y_fill: true, expand: true });
    },

    _onDeviceRemoved: function (path) {
        global.log ("DEVICE REMOVED: " + path);
        this._loadDevices ();
    },

    _onDeviceAdded: function (path) {
        global.log ("DEVICE ADDED: " + path);
        this._loadDevices ();
    },

    _loadDevices: function () {
        global.log ("LOADING DEVICES");
        modem_manager_proxy.EnumerateDevicesRemote(Lang.bind(this, this._onGetModems));
    },

    _onGetModems: function (modems, err) {
        if (err) {
            global.log ("ERROR loading modems: " + err);
            return;
        }
        if (modems) {
            modems = modems[0];
            if (modems.length > 0) {
                global.log ("CARGANDO " + modems[0]);
                this._init_modem (modems[0]);
                return;
            }
        }

        // If there's no modem, we empty the message list and hide the panel button
        global.log ("NO MODEMS AVAILABLE");
        this.actor.hide();

        this._SmsList= {};
        this._reloadInterface ();
    },

    _init_modem: function (modem_path) {
            global.log ("MODEM: " + modem_path);

            properties_proxy = new PropertiesDBus (Gio.DBus.system, 'org.freedesktop.ModemManager', ''+modem_path);
            properties_proxy.connectSignal ('MmPropertiesChanged', Lang.bind (this, function (proxy, sender, [iface, properties]) {
                this._onModemPropertiesChanged (iface, properties);
            }));

            sms_proxy = new SmsDBus (Gio.DBus.system, 'org.freedesktop.ModemManager', ''+modem_path);
            sms_proxy.connectSignal ('SmsReceived', Lang.bind (this, function (proxy, sender, [id, complete]) {
                this._onSmsReceived (id, complete);
            }));
            sms_proxy.connectSignal ('Completed', Lang.bind (this, function (proxy, sender, [id, complete]) {
                this._onSmsReceived (id, complete);
            }));

            modem_proxy = new ModemDBus (Gio.DBus.system, 'org.freedesktop.ModemManager', ''+modem_path);
            modem_proxy.EnableRemote (true, Lang.bind (this, this._onModemEnabled));
    },

    _onModemEnabled: function ([], err) {
        if (err) {
            global.log ("ERROR enabling modem: " + err);
            this._resetDevice ();
            return;
        }
        if (modem_proxy.Enabled) {
            global.log ("MODEM ENABLED");

            this._resetAttempt = 0;
            sms_proxy.ListRemote (Lang.bind (this, this._onSmsList));

            this.actor.show ();
        }
        else {
            this._resetDevice ();
        }
    },

    _onModemDisabled: function ([], err) {
        modem_proxy.EnableRemote (true, Lang.bind (this, this._onModemEnabled));
    },

    _onModemPropertiesChanged: function (iface, properties) {
        if (properties.UnlockRequired) {
            this._resetAttempt = 0;
            this._resetDevice ();
        }
    },

    _onSmsReceived: function (id, complete) {
        if (complete) {
            global.log ("RECIBIDO!!!!!!!!!!");
            sms_proxy.ListRemote (Lang.bind (this, this._onSmsList));
            sms_proxy.GetRemote (id, Lang.bind (this, function (sms, err) {
                if (err) {
                    global.log ("ERROR getting sms: " + err);
                    return;
                }

                if (sms) {
                    this._notificationSystem.notify (_("SMS received"), "Texto de la notificacion");
                }
            }));
        }
    },

    _onSmsList: function (list, err) {
        if (err) {
            global.log ("ERROR loading sms list: " + err);
            this._resetDevice ();
            return;
        }

        this._SmsList= {};
        if (list) {
            list = list[0];
            for (let i in list) {
                let sms = list[i];

                let phone = sms.number.get_string()[0];
                let timestamp = sms.timestamp.get_string()[0];
                let text = sms.text.get_string()[0];

                if (!(phone in this._SmsList)) {
                    this._SmsList[phone] = [];
                }
                let message = new Message (phone, timestamp, text);
                this._SmsList[phone].push (message);
            }
        }
        this._reloadInterface ();
    },

    _resetDevice: function () {
        this._resetAttempt += 1;
        if (this._resetAttempt > MAX_RESET_ATTEMPTS) {
            global.log ("MAX RESET ATTEMPTS ACHIEVED. STOP TRYING");
            return;
        }

        global.log ("RESETING DEVICE. ATTEMPT: " + this._resetAttempt);
        modem_proxy.EnableRemote (false, Lang.bind (this, this._onModemDisabled));
    },

    _onUpdateContacts: function () {
        this._reloadInterface ();
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

        this._messageDisplay.show();
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

        this._contactButtons = [];

        this._searchEntry = new St.Entry({ name: 'searchEntry',
                                     style_class: 'gsms-search-entry',
                                     hint_text: _("Type to search..."),
                                     track_hover: true,
                                     can_focus: true });
        this._searchEntry.set_secondary_icon (new St.Icon({ style_class: 'search-entry-icon',
                                                      icon_name: 'edit-find',
                                                      icon_type: St.IconType.SYMBOLIC }));
        this._text = this._searchEntry.clutter_text;
        this._text.connect('key-press-event', Lang.bind(this, this._onKeyPress));
        this._text.connect('text-changed', Lang.bind(this, this._onTextChanged));

        this.add_actor (this._createNewMessageButton ());
        this.add_actor(new Separator (), { expand: true });
        this.add_actor (this._searchEntry);

        this._contactsBox = new St.BoxLayout ({vertical: true, style_class: 'gsms-contacts-box'});

        let scrollview = new St.ScrollView ({ style_class: 'gsms-contact-list-scrollview',
                                              vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                                              hscrollbar_policy: Gtk.PolicyType.NEVER });
        scrollview.add_actor (this._contactsBox); 
        this.add (scrollview, {expand: true});
    },

    loadContacts: function (smsList) {
        this._contactsBox.remove_all_children();
        this._smsList = smsList;

        for (let phone in this._smsList) {
            let contact = new Contact (phone);
            let contactButton = new ContactButton (contact);
            contactButton.connect ('clicked', Lang.bind (this, this._onContactButtonClicked));
            this._contactButtons.push (contactButton);
            this._contactsBox.add (contactButton, { x_fill: true, y_fill: true, expand: false });
        }
    },

    _createNewMessageButton: function () {
        let newMessageButton = new St.Button ( {style_class: 'gsms-new-message-button', x_align: St.Align.START} );
        newMessageButton.connect ('clicked', Lang.bind (this, this._onNewMessageButtonClicked));
        let child = new St.BoxLayout ({style_class: 'gsms-contact-button-box'});
        newMessageButton.set_child (child);

        let icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                   icon_size: CONTACT_ICON_SIZE,
                                   style_class: 'gsms-contact-icon' });
        icon.icon_name = 'list-add';

        let label = new St.Label ({style_class: 'gsms-contact-details-label'});
        label.set_text (_("New message..."));

        child.add (icon);
        child.add (label);

        return newMessageButton;
    },

    _onKeyPress: function (obj, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.Escape) {
            this._resetSearch();
        }
    },

    _onTextChanged: function (se, prop) {
        let searchString = this._searchEntry.get_text();
        this._filterContacts (searchString);
    },

    _resetSearch: function () {
        this._searchEntry.set_text ("");
    },

    _filterContacts: function (searchString) {
        for (let i in this._contactButtons) {
            let button = this._contactButtons[i];
            let contact = button.contact;

            if (contact.does_apply (searchString)) {
                button.show();
            }
            else {
                button.hide();
            }
        }
    },

    _onContactButtonClicked: function (button) {
        this.emit ('selected-contact', button.contact);
    },

    _onNewMessageButtonClicked: function (button) {
        let dialog = new NewMessageDialog ();
        dialog.open();
    }
});
Signals.addSignalMethods(ContactList.prototype);

const Message = new Lang.Class ({
    Name: 'Message',

    _init: function (phone, date, text) {
        this.phone = phone;
        this.date = this._parseDate (date);
        this.text = text;
    },

    _parseDate: function (date) {
        // Date format: y/m/d,H:i:sO
        let match = date.match (/(\d{2})\/(\d{2})\/(\d{2})\,(\d{2})\:(\d{2})\:(\d{2})(\+)?(\d*)?/);
        if (!match)
            return "";

        let year = 2000 + parseInt(match[1]);
        let month = parseInt(match[2])-1;
        let day = parseInt(match[3]);
        let hour = parseInt(match[4]);
        let minute = parseInt(match[5]);
        let second = parseInt(match[6]);

        let gmt = null;
        if (match.length > 7) {
            let sign = match[7];
            let gmt = match[8];

            if (sign == '-') {
                hour -= parseInt (gmt);
            }
            else if (sign == '+') {
                hour += parseInt (gmt);
            }
        }

        let parsedDate = new Date (Date.UTC (year, month, day, hour, minute, second));
        return parsedDate.toLocaleString();
    }
});

const Contact = new Lang.Class ({
    Name: 'Contact',

    _init: function (phone) {
        this.name = phone;
        this.phone = phone;
        this.avatar = null;

        this.individual = smsHelper.search_by_phone (phone);
        if (this.individual) {
            this.avatar = this.individual.avatar;

            this.name = smsHelper.get_name (this.individual);
            if (this.name == "")
                this.name = phone;
        }
        else {
            this.name = phone;
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

    does_apply: function (searchString) {
        searchString = searchString.toLowerCase ();

        if (!this.individual) {
            return this.phone.indexOf (searchString) !== -1;
        }
        else {
            return smsHelper.does_apply (this.individual, searchString);
        }
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
        this._details.add (this._name);

        if (this.contact.name != this.contact.phone) {
            this._phone = new St.Label ({style_class: 'gsms-contact-details-label-small'});
            this._phone.set_text (this.contact.phone);
            this._details.add (this._phone);
        }

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
                                              vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                                              hscrollbar_policy: Gtk.PolicyType.NEVER});

        this._conversationDisplay = new St.BoxLayout ({vertical:true, style_class: 'gsms-conversation-display'});
        scrollview.add_actor (this._conversationDisplay);

        this._entry = new St.Entry({ style_class: 'gsms-message-reply-entry',
                                     hint_text: _("Type your answer..."),
                                     track_hover: true,
                                     can_focus: true });
        this._text = this._entry.clutter_text;
        this._text.single_line_mode = false;
        this._text.line_wrap = true;
        this._text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._text.ellipsize = Pango.EllipsizeMode.NONE;
        this._text.connect('key-press-event', Lang.bind(this, this._onKeyPress));

        this._charCounter = new CharCounter (this._entry);
        this._charCounter.style_class = 'gsms-char-counter';

        this.add (scrollview, { x_fill: true, y_fill: true, expand: false });
        this.add (this._entry, { x_expand: false, y_expand: true, y_fill: true } );
        this.add (this._charCounter);
    },

    clear: function () {
        this._conversationDisplay.remove_all_children();
    },

    loadMessages: function (contact, messages) {
        this._entry.set_text ("");
        this._loadSenderInfo (contact);

        for (let i in messages) {
            let message = messages[i];
            let messageView = new MessageView ("incoming", message);
            this._conversationDisplay.add_actor (messageView);
        }
    },

    _loadSenderInfo: function (contact) {
        this._senderBox.remove_all_children();

        let details = new St.BoxLayout({ style_class: 'gsms-contact-details',
                                         vertical: true });
        let name = new St.Label ({style_class: 'gsms-contact-details-label'});
        name.set_text (contact.name);
        details.add (name, {expand: true, y_align: St.Align.MIDDLE});

        this._senderBox.add (contact.getIcon());
        this._senderBox.add_actor (details);
    },

    _sendMessage: function () {
        if (sms_proxy) {
            phone = '663273481';
            text = this._entry.get_text ();

            let message = {};
            message['number'] = phone;
            message['text'] = text;

            sms_proxy.SendRemote(message, Lang.bind(this, this._onSmsSend));
        }
    },

    _onSmsSend: function ([], err) {
        if (err) {
            global.log ("ERROR sending sms: " + err);
            return;
        }

        global.log ("SMS sent ok");
    },

    _onKeyPress: function (obj, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            this._sendMessage ();
            this._entry.set_text ("");
        }
    },
});

const CharCounter = new Lang.Class({
    Name: 'CharCounter',
    Extends: St.Label,

    _init: function (entry) {
        this.parent ();
        this.set_text ("0/" + MAX_SMS_LENGTH_GSM7); 

        this._entry = entry;
        this._text = this._entry.clutter_text;
        this._text.connect('text-changed', Lang.bind(this, this._onTextChanged));
    },

    _onTextChanged: function (se, prop) {
        let text = this._entry.get_text ();
        let length = text.length;
        let encoding = get_encoding (text);
        let num_messages;

        if (encoding == ENCODING_GSM7) {
            num_messages = Math.ceil (length/MAX_SMS_LENGTH_GSM7);
            num_messages=(num_messages==0)?1:num_messages;
            this.set_text ("" + length + "/" + MAX_SMS_LENGTH_GSM7 * num_messages); 
        }
        else if (encoding == ENCODING_UCS2) {
            num_messages = Math.ceil (length/MAX_SMS_LENGTH_UCS2);
            num_messages=(num_messages==0)?1:num_messages;
            this.set_text ("" + length + "/" + MAX_SMS_LENGTH_UCS2 * num_messages); 
        }
        else {
            this.actor.set_text (_("Unrecognizable encoding"));
            return;
        }
    },
});

const MessageView = new Lang.Class({
    Name: 'MessageView',
    Extends: St.Table,

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

            this.add (this._tag_icon, { row: 0, col: 0, row_span: 2, y_fill: false, y_expand: false, y_align: St.Align.START } );
            this.add (this._text, { row: 0, col: 1, x_fill: false, x_align: St.Align.START });
        }
        else {
            this._text.style_class = 'gsms-message-outgoing';

            this._tag_icon = new St.Icon ({ icon_type: St.IconType.FULLCOLOR,
                                            icon_size: 12,
                                            gicon: Gio.icon_new_for_string(extension.path + "/right-arrow.png"),
                                            });

            this.add (this._text, { row: 0, col: 0} );
            this.add (this._tag_icon, { row: 0, col: 1, row_span: 2, y_fill: false, y_expand: false, y_align: St.Align.START } );
        }
        this._tag_icon.style_class ='gsms-message-tag';

        this._text.set_text (message.text);

        this._date = new St.Label ();
        this._date.style_class = 'gsms-message-date';
        this._date.set_text (message.date);
        this.add (this._date, { row: 1, col: 1, x_fill: true, x_align: St.Align.END } );
    },
});

const NewMessageDialog = new Lang.Class ({
    Name: 'NewMessageDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function (params) {
        this.parent (params);

        this.destinees = [];

        let mainContentLayout = new St.BoxLayout ({ style_class: "gsms-new-message-layout",
                                                    vertical: true });
        this.contentLayout.add(mainContentLayout, { x_fill: true, y_fill: false });

        let titleLabel = new St.Label ({ text: _("Write a new SMS:"),
                                     style_class: 'gsms-new-message-title' });
        mainContentLayout.add (titleLabel);

        this.destinyEntry = new ContactsEntry ({ style_class: "gsms-new-message-entry",
                                                 hint_text: _("To..."),
                                                 track_hover: true,
                                                 can_focus: true });
        this.destinyEntry.connect ("phone_added", Lang.bind (this, this._onPhoneAdded));
        this.destinyEntry.connect ("contact_selected", Lang.bind (this, this._onContactSelected));
        mainContentLayout.add (this.destinyEntry );

        this.destinyBox = new St.BoxLayout ( { style_class: "gsms-new-message-contact-box" });
        mainContentLayout.add (this.destinyBox);

        this.textEntry = new St.Entry({ style_class: "gsms-new-message-entry",
                                        hint_text: _("Write here your message"),
                                        track_hover: true,
                                        can_focus: true });
        this.textEntry.clutter_text.single_line_mode = false;
        this.textEntry.clutter_text.line_wrap = true;
        this.textEntry.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this.textEntry.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        mainContentLayout.add (this.textEntry, { x_expand: false, y_expand: true, y_fill: true } );

        this._charCounter = new CharCounter (this.textEntry);
        this._charCounter.style_class = 'gsms-char-counter';
        mainContentLayout.add (this._charCounter);

        this.setButtons([{ label: _("Cancel"),
                           action: Lang.bind(this, this._onCancelButtonPressed),
                           key:    Clutter.Escape
                         },
                         { label:  _("Send"),
                           action: Lang.bind(this, this._onSendButtonPressed)
                         }]);
    },

    _onPhoneAdded: function (entry, phone) {
        this.destinees.push ("" + phone);
        let button = new St.Button ( { label: phone, reactive: true, style_class: 'gsms-new-message-contact-button' } );
//        button.connect ('clicked', Lang.bind (this, this._onNewMessageButtonClicked));
        this.destinyBox.add (button);
    },

    _onContactSelected: function (entry, contact, phone) {
        this.destinees.push ("" + phone);

        let name = smsHelper.get_name (contact);
        if (name == "")
            name == phone; 
        let button = new St.Button ( { label: name, reactive: true, style_class: 'gsms-new-message-contact-button' } );
//        button.connect ('clicked', Lang.bind (this, this._onNewMessageButtonClicked));
        this.destinyBox.add (button);
    },

    _onCancelButtonPressed: function (button, event) {
        this.close(global.get_current_time());
    },

    _onSendButtonPressed: function (button, event) {
        for (let phone in this.destinees)
            global.log (this.destinees[phone]);
        this.close(global.get_current_time());
    },
});

const ContactsEntry = new Lang.Class ({
    Name: 'ContactsEntry',
    Extends: St.Entry,

    _init: function (params) {
        this.parent (params);

        this._text = this.clutter_text;
        this._text.connect('key-press-event', Lang.bind(this, this._onKeyPress));
        this._text.connect('text-changed', Lang.bind(this, this._onTextChanged));
    },

    _onKeyPress: function (obj, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.Escape) {
            if (this._popupMenu) {
                this._popupMenu.destroy();
                this._popupMenu = null;
                return true;
            }                
        }
        if (symbol == Clutter.Return || symbol == Clutter.KP_Enter || symbol == Clutter.comma) {
            this.emit ("phone_added", this.get_text());
            this.set_text ("");
            this.grab_key_focus();
            return true;
        }
        return false;
    },

    _onTextChanged: function (se, prop) {
        let searchString = this.get_text();
        
        if (searchString.length >= MIN_CONTACT_SEARCH_LENGTH) {
            let contacts = smsHelper.search_contacts (searchString);

            if (contacts.length > 0) {
                this._loadMenu (contacts);
            }
        }
        else {
            if (this._popupMenu) {
                this._popupMenu.destroy();
                this._popupMenu = null;
            }
        }
    },

    _loadMenu: function (contacts) {
        if (this._popupMenu) {
            this._popupMenu.destroy();
            this._popupMenu = null;
        }

        this._popupMenu = new PopupMenu.PopupMenu (this, 0.0, St.Side.TOP, 0);
        Main.uiGroup.add_actor(this._popupMenu.actor);
        this._popupMenu.actor.hide();

        for (let i in contacts) {
            // We show only the first MAX_CONTACT_SEARCH_DISPLAY contacts
            if (i < MAX_CONTACT_SEARCH_DISPLAY) {
                let contact = contacts[i];
                let name;

                name = smsHelper.get_name (contact);
                if (name == "")
                    name = "UNKNOWN";

                let numbers = smsHelper.get_phone_numbers (contact);
                for (let number in numbers) {
                    let item = new PopupMenu.PopupMenuItem (name + " (" + numbers[number] + ")\n" + number);
                    this._popupMenu.addMenuItem (item);
                    item.connect('activate', Lang.bind(this, function() {
                        this.set_text ("");
                        this.grab_key_focus();
                        this.emit ('contact_selected', contact, number);
                    }));
                }
            }
        }
        this._popupMenu.open ();
    }
});
Signals.addSignalMethods(ContactsEntry.prototype);

const NotificationSystem = new Lang.Class ({
    Name: 'NotificationSystem',

    _init: function () {
        this._source = new MessageTray.Source(APP_NAME, 'phone', St.IconType.SYMBOLIC);
        Main.messageTray.add(this._source);
    },

    notify: function (title, text, icon) {
        if (!icon) {
            icon = new St.Icon({ icon_name: 'phone',
                                 icon_size: this._source.ICON_SIZE });
        }

        this._notification = new MessageTray.Notification(this._source, title, text, { icon: icon });
        this._source.notify(this._notification);
    },
});

const Separator = new Lang.Class({
    Name: 'Separator',
    Extends: St.DrawingArea,

    _init: function () {
        this.parent();
        this.style_class = 'gsms-contactsbox-separator';
        this.connect('repaint', Lang.bind(this, this._onRepaint));
    },

    _onRepaint: function(area) {
        let cr = area.get_context();
        let themeNode = area.get_theme_node();
        let [width, height] = area.get_surface_size();
        let margin = themeNode.get_length('-margin-horizontal');
        let gradientHeight = themeNode.get_length('-gradient-height');
        let startColor = themeNode.get_color('-gradient-start');
        let endColor = themeNode.get_color('-gradient-end');

        let gradientWidth = (width - margin * 2);
        let gradientOffset = (height - gradientHeight) / 2;
        let pattern = new Cairo.LinearGradient(margin, gradientOffset, width - margin, gradientOffset + gradientHeight);
        pattern.addColorStopRGBA(0, startColor.red / 255, startColor.green / 255, startColor.blue / 255, startColor.alpha / 255);
        pattern.addColorStopRGBA(0.5, endColor.red / 255, endColor.green / 255, endColor.blue / 255, endColor.alpha / 255);
        pattern.addColorStopRGBA(1, startColor.red / 255, startColor.green / 255, startColor.blue / 255, startColor.alpha / 255);
        cr.setSource(pattern);
        cr.rectangle(margin, gradientOffset, gradientWidth, gradientHeight);
        cr.fill();
    }
});

function get_encoding (text) {
    return ENCODING_GSM7;
}

function init() {
}

function enable() {
    let smsApplet = new SmsApplet ();
    Main.panel.addToStatusArea('sms', smsApplet);
}

function disable() {
    smsButton.destroy();
}

