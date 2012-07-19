EXTRA_DIST = 
CLEANFILES =
MAINTAINERCLEANFILES =

#Extension
#-----------------------------------
include ../include.mk
dist_extension_DATA = extension.js stylesheet.css left-arrow.png right-arrow.png 
nodist_extension_DATA = metadata.json

EXTRA_DIST += metadata.json.in
CLEANFILES += metadata.json

#GSettings schema
gsettings_SCHEMAS = org.gnome.shell.extensions.sms.gschema.xml
@GSETTINGS_RULES@

#Helper 
#-----------------------------------
AM_VALAFLAGS=								\
		--vapidir=$(srcdir)/../vapi				\
		$(GNOMESMS_PACKAGES)

lib_LTLIBRARIES = libgnomesms.la
libgnomesms_la_SOURCES = helper.vala
libgnomesms_la_VALAFLAGS = 			\
			$(AM_VALAFLAGS) 	\
			--gir=GnomeSms-0.1.gir	\
			--library=GnomeSms	\
			-H GnomeSms.h

libgnomesms_la_CFLAGS = 			\
			$(AM_CFLAGS) 		\
			$(GNOMESMS_CFLAGS)

libgnomesms_la_LIBADD = 			\
			$(AM_LIBADD) 		\
			$(GNOMESMS_LIBS)

libgnomesms_dlname = \
	`$(SED) -n "s/^dlname='\([A-Za-z0-9.+-]\+\)'/\1/p" libgnomesms.la`

-include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS =
INTROSPECTION_SCANNER_ARGS =
INTROSPECTION_COMPILER_ARGS = -l $(libgnomesms_dlname)

GnomeSms-0.1.gir: libgnomesms.la
GIRS = GnomeSms-0.1.gir

girdir = $(datadir)/gir-1.0
dist_gir_DATA = $(GIRS)

MAINTAINERCLEANFILES += $(dist_gir_DATA)

typelibdir = $(libdir)/girepository-1.0
nodist_typelib_DATA = $(GIRS:.gir=.typelib)

CLEANFILES += $(nodist_typelib_DATA)

metadata.json: metadata.json.in $(top_builddir)/config.status
	$(AM_V_GEN) sed -e "s|[@]UUID@|$(uuid)|" \
        -e "s|[@]LOCALEDIR@|$(datadir)/locale|" \
	    -e "s|[@]URL@|$(extensionurl)|" $< > $@
