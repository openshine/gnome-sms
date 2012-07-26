# gnome-sms

gnome-sms is a simple extension to view, send and receive SMS messages in an easy way. It relies on ModemManager to comunicate with the 3G device.

## Installation

### Manual installation

Git branch `master` works with the current stable release of GNOME Shell (currently 3.4) only.

Prerequisites: automake, gnome-common, gettext, glib2 devel files, libfolks devel files, and a Vala compiler.

#### System-wide:

Unfortunately, Gnome Shell extensions can't be installed in /usr/local, so you must install it in /usr by now.

    ./autogen.sh --prefix=/usr
    make
    sudo make install

Restart the shell and then enable the extension. Please be aware that the extension only appears if you have an active (PIN enabled) 3G device inserted in your computer.

## Authors

  * César García Tapia <tapia@openshine.com>