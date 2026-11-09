cask "iris" do
  version "0.1.3"
  sha256 "ad7fc4f25de1c0b874a501c1124b96c171589f99002d828d6a27735945b9a679"

  url "https://github.com/igdrasil-app/homebrew-tap/releases/download/v#{version}/Iris-#{version}.tar.gz"
  name "Iris"
  desc "Apple Calendar for the coding agents you run"
  homepage "https://github.com/igdrasil-app/iris"

  # The menu bar app updates itself with Sparkle; a plain brew upgrade skips a bundle that is already current.
  auto_updates true
  depends_on macos: :sonoma

  app "Iris.app"
  binary "#{appdir}/Iris.app/Contents/MacOS/iris"

  # Upgrades quit the menu bar app and brew reopens the new one; iris mcp processes are not apps and keep running.
  uninstall quit: "app.igdrasil.iris"

  caveats <<~EOS
    Open Iris once to put it in the menu bar; macOS may ask you to confirm the download:
      open #{appdir.to_s.shellescape}/Iris.app
    macOS asks once for Calendar access, on the first calendar command:
      iris calendar calendars
    Add iris to Claude Code (other hosts: iris help mcp):
      claude mcp add --scope user iris -- iris mcp
  EOS
end
