using Folks;

public class GnomeSms.Helper: GLib.Object {

    public static string[] get_phone_numbers (string phone) {
        string[] numbers = {};
	numbers += phone;
        return numbers;
    }
}
