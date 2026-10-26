cask "iris" do
  version "0.1.1"
  sha256 "0907a24011321d39cfaaaebd4d34f835960f245abc042616cbe0e67a7c0c772d"

  url "https://github.com/igdrasil-app/homebrew-tap/releases/download/v#{version}/Iris-#{version}.tar.gz"
  name "Iris"
  desc "Apple Calendar for the coding agents you run"
  homepage "https://github.com/igdrasil-app/iris"

  depends_on macos: :sonoma

  app "Iris.app"
  binary "#{appdir}/Iris.app/Contents/MacOS/iris"
end
