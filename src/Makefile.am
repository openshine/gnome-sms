include ../include.mk

dist_extension_DATA = extension.js stylesheet.css 
nodist_extension_DATA = metadata.json

EXTRA_DIST = metadata.json.in
CLEANFILES = metadata.json

metadata.json: metadata.json.in $(top_builddir)/config.status
	$(AM_V_GEN) sed -e "s|[@]UUID@|$(uuid)|" \
        -e "s|[@]LOCALEDIR@|$(datadir)/locale|" \
	    -e "s|[@]URL@|$(extensionurl)|" $< > $@
