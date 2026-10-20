#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string>

namespace makesfx {

// FIPS 180-4 SHA-256. Used for render report hashes and the golden corpus.
class Sha256 {
public:
  Sha256() noexcept;

  void update(const std::uint8_t* data, std::size_t size) noexcept;
  void update(std::span<const std::uint8_t> data) noexcept { update(data.data(), data.size()); }

  // Feeds samples as IEEE-754 binary32 little-endian, independent of host endianness.
  void updateFloatsLE(std::span<const float> samples) noexcept;
  // Feeds values as IEEE-754 binary64 little-endian.
  void updateDoublesLE(std::span<const double> values) noexcept;

  std::array<std::uint8_t, 32> finish() noexcept;
  std::string finishHex();

private:
  void compress(const std::uint8_t* block) noexcept;

  std::array<std::uint32_t, 8> state_;
  std::array<std::uint8_t, 64> buffer_{};
  std::size_t bufferSize_ = 0;
  std::uint64_t totalBytes_ = 0;
};

std::string sha256Hex(std::span<const std::uint8_t> data);
std::string toHex(std::span<const std::uint8_t> bytes);

}  // namespace makesfx
