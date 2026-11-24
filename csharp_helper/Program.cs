using System.Text.Json;

// Optional .NET 8 parity checker for the daily-product formula in MULTIMEDIA.xlsx.
// Input example: {"cct":5,"ccd":2,"indv":1,"ifi":0,"dth":1,"challenge":20}
var input = await Console.In.ReadToEndAsync();
using var document = JsonDocument.Parse(input);
var root = document.RootElement;
double Read(string key) => root.TryGetProperty(key, out var value) && value.TryGetDouble(out var number) ? number : 0;
var cct = Read("cct");
var ccd = Read("ccd");
var indv = Read("indv");
var ifi = Read("ifi");
var dth = Read("dth");
var challenge = Read("challenge");
var weighted = (cct * 3) + (ccd * 2) + indv + ifi + dth;
var result = new {
    weightedProducts = weighted,
    deficit = weighted - challenge,
    completion = challenge == 0 ? (double?)null : weighted / challenge,
    engine = "C# audit"
};
Console.WriteLine(JsonSerializer.Serialize(result));
