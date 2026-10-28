cask "iris" do
  version "0.1.2"
  sha256 "5d3151e3f6f9b104c8ac09f001050d00dbbe0282675d8810f0bb1a284b884f2a"

  url "https://github.com/igdrasil-app/homebrew-tap/releases/download/v#{version}/Iris-#{version}.tar.gz"
  name "Iris"
  desc "Apple Calendar for the coding agents you run"
  homepage "https://github.com/igdrasil-app/iris"

  depends_on macos: :sonoma

  app "Iris.app"
  binary "#{appdir}/Iris.app/Contents/MacOS/iris"
end
