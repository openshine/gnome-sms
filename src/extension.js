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
const Lang = imports.lang;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;

/* Global vars */

let smsButton;

const SmsButton = new Lang.Class({
    Name: 'SmsButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "sms");

	this._iconBox = new St.BoxLayout();
	this._iconIndicator = new St.Icon({icon_name: 'phone',
		                           style_class: 'system-status-icon'});
	this._iconStateBin = new St.Bin({child: this._iconIndicator,
		                         y_align: St.Align.END});

	this._iconBox.add(this._iconStateBin);
	this.actor.add_actor(this._iconBox);
	this.actor.add_style_class_name('panel-status-button');
//	this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
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

