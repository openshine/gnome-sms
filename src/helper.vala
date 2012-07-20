using Folks;
using Gee;

public class GnomeSms.Helper: GLib.Object {

    public signal void update_contacts ();

    private HashMap<string, Individual> individuals = new HashMap<string, Individual> ();

    public Helper () {
    }

    public void read_individuals () {
        IndividualAggregator agg = new IndividualAggregator ();
        agg.individuals_changed_detailed.connect (individuals_changed_cb);
        agg.prepare ();
    }

    public Individual? search_by_phone (string phone) {
        string normalisedPhone = new PhoneFieldDetails (phone).get_normalised();

        foreach (var entry in individuals.entries) {
            string id = entry.key;
            Individual individual = entry.value;

            foreach (var phoneDetails in individual.phone_numbers) {
		string normPhoneDetails = phoneDetails.get_normalised ();
                if (normalisedPhone.has_suffix (normPhoneDetails) || normPhoneDetails.has_suffix (normalisedPhone)) {
		    stdout.printf(phone + " - " + phoneDetails.get_normalised() + "\n");
                    return individual;
                }
            }
        }

        return null;
    }
    
    public Individual[] search_contacts (string searchString) {
        Individual[] contacts = {};

        foreach (var entry in individuals.entries) {
            Individual individual = entry.value;

            if (does_apply (individual, searchString)) {
                contacts += individual;
            }
        }

        return contacts;
    }

    public static bool does_apply (Individual individual, string searchString) {
        if (searchString in individual.full_name.down()) {
            return true;
        }
        else if (searchString in individual.alias.down()) {
            return true;
        }
        else if (searchString in individual.nickname.down()) {
            return true;
        }
        
        foreach (var phone in individual.phone_numbers) {
            if (searchString in phone.value.down()) {
                return true;
            }
            else if (searchString in phone.get_normalised ().down()) {
                return true;
            }
        }

        return false;
    }

    public static string get_name (Individual individual) {
        string name = "";

        if (individual.full_name != null)
            name = individual.full_name;
        else if (individual.alias != null)
            name = individual.alias;
        else if (individual.nickname != null)
            name = individual.nickname;

        return name;
    }

    public static HashTable<string, string> get_phone_numbers (Individual individual) {
        var numbers = new HashTable<string, string> (null, null);
        
        foreach (var phone in individual.phone_numbers) {
            numbers.insert (phone.value, get_phone_type_string (phone.parameters.get("type")));
        }

        return numbers;
    }

    private static string get_phone_type_string (Gee.Collection<string> types) {
        if ("work" in types && "voice" in types) {
            return _("Work");
        }
        else if ("work" in types && "fax" in types) {
            return _("Work Fax");
        }
        else if ("car" in types) {
            return _("Car");
        }
        else if ("home" in types && "voice" in types) {
            return _("Home");
        }
        else if ("home" in types && "fax" in types) {
            return _("Home Fax");
        }
        else if ("isdn" in types) {
            return _("ISDN");
        }
        else if ("cell" in types) {
            return _("Mobile");
        }
        else if ("voice" in types) {
            return _("Other");
        }
        else if ("fax" in types) {
            return _("Fax");
        }

        return "";
    }

    private void individuals_changed_cb (MultiMap<Individual?, Individual?> changes) {
        var added = changes.get_values ();
        var removed = changes.get_keys ();

        bool update = false;

        foreach (Individual i in added)
        {
            individuals.set (i.id, i);
            update = true;
        }

        foreach (var i in removed)
        {
            if (i != null) {
                individuals.unset (i.id);
                update = true;
            }
        }

        if (update) {
            update_contacts ();
        }
    }
}
