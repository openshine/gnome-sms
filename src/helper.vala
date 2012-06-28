using Folks;
using Gee;

public class GnomeSms.Helper: GLib.Object {

    public signal void update_contacts ();

    private HashMap<string, Individual> individuals = new HashMap<string, Individual> ();

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

            foreach (var individualPhone in individual.phone_numbers) {
                if (normalisedPhone == individualPhone.get_normalised ()) {
                    return individual;
                }
            }
        }

        return null;
    }

    public static string[] get_phone_numbers (Individual individual) {
        int i = 0;

        string[] numbers = new string[individual.phone_numbers.size];
        
        foreach (var phone in individual.phone_numbers) {
            numbers[i] = phone.value;
            i++;
        }

        return numbers;
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
