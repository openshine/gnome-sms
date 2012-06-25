AC_PREREQ(2.63)
dnl be carefull, the version needs to be in sync with your gnome shell version
AC_INIT([gnome-sms],[0.1],[https://github.com/openshine/gnome-sms])
AM_INIT_AUTOMAKE([1.10 dist-bzip2 no-dist-gzip foreign tar-ustar])

# Enable silent rules is available
AM_SILENT_RULES([yes])
AM_MAINTAINER_MODE([enable])

LT_INIT
AC_PROG_CC
AM_PROG_VALAC([0.14.0])
AC_PROG_INSTALL

GETTEXT_PACKAGE=gnome-sms
AC_SUBST(GETTEXT_PACKAGE)
AC_DEFINE_UNQUOTED(GETTEXT_PACKAGE, "$GETTEXT_PACKAGE",
                   [The prefix for our gettext translation domains.])
IT_PROG_INTLTOOL(0.26)

PKG_PROG_PKG_CONFIG([0.22])

GLIB_GSETTINGS

dnl Please keep this sorted alphabetically
AC_CONFIG_FILES([
  Makefile
  po/Makefile.in
  src/Makefile
])
AC_OUTPUT
