using Folks;

public class GnomeSms.Helper: GLib.Object {

    public static string[] get_phone_numbers (Individual individual) {
        int i = 0;

        string[] numbers = new string[individual.phone_numbers.size];
        
        foreach (var phone in individual.phone_numbers) {
            numbers[i] = phone.value;
            i++;
        }

        return numbers;
    }
}
