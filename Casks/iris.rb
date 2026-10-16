cask "iris" do
  version "0.1.0"
  sha256 "a99b98afd2724639968cdfc2066fb8b9e04e94e3ab91826586886b3f1f29a9c4"

  url "https://github.com/igdrasil-app/homebrew-tap/releases/download/v#{version}/Iris-#{version}.tar.gz"
  name "Iris"
  desc "Apple Calendar for the coding agents you run"
  homepage "https://github.com/igdrasil-app/iris"

  depends_on macos: :sonoma

  app "Iris.app"
  binary "#{appdir}/Iris.app/Contents/MacOS/iris"
end
