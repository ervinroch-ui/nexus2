#include <cmath>
#include <iostream>
#include <regex>
#include <string>

static double read_number(const std::string& json, const std::string& key) {
    std::regex pattern("\\\"" + key + "\\\"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)");
    std::smatch match;
    if (std::regex_search(json, match, pattern)) return std::stod(match[1].str());
    return 0.0;
}

int main() {
    std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
    const double cct = read_number(input, "cct");
    const double ccd = read_number(input, "ccd");
    const double indv = read_number(input, "indv");
    const double ifi = read_number(input, "ifi");
    const double dth = read_number(input, "dth");
    const double challenge = read_number(input, "challenge");
    const double weighted = cct * 3.0 + ccd * 2.0 + indv + ifi + dth;
    const double deficit = weighted - challenge;
    std::cout << "{\"weightedProducts\":" << weighted
              << ",\"deficit\":" << deficit << ",\"completion\":";
    if (challenge > 0) std::cout << weighted / challenge;
    else std::cout << "null";
    std::cout << "}";
    return 0;
}
