using Folks;

class SMS.Helper: GLib.Object {

    public static string[] get_phone_numbers (Individual individual) {
        string[] numbers = {};
        foreach (var phone in individual.phone_numbers) {
            numbers += phone;
        }
        
        return numbers;
    }
}
