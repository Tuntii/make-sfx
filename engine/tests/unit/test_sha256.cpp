#include <doctest.h>

#include <string>
#include <vector>

#include "math/sha256.hpp"

using makesfx::Sha256;
using makesfx::sha256Hex;

namespace {

std::string hashOf(const std::string& s) {
  return sha256Hex({reinterpret_cast<const std::uint8_t*>(s.data()), s.size()});
}

}  // namespace

TEST_CASE("SHA-256 FIPS 180-4 test vectors") {
  CHECK(hashOf("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  CHECK(hashOf("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  CHECK(hashOf("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq") ==
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  CHECK(hashOf(std::string(1000000, 'a')) ==
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
}

TEST_CASE("incremental updates equal one-shot hashing") {
  const std::string text(1000, 'x');
  Sha256 h;
  for (std::size_t i = 0; i < text.size(); i += 37) {
    const std::size_t n = std::min<std::size_t>(37, text.size() - i);
    h.update(reinterpret_cast<const std::uint8_t*>(text.data() + i), n);
  }
  CHECK(h.finishHex() == hashOf(text));
}

TEST_CASE("float hashing is little-endian binary32") {
  // 1.0f = 0x3f800000 -> bytes 00 00 80 3f
  const std::vector<float> one = {1.0f};
  Sha256 h;
  h.updateFloatsLE(one);
  const std::uint8_t bytes[] = {0x00, 0x00, 0x80, 0x3f};
  CHECK(h.finishHex() == sha256Hex(bytes));
}
