interface HeaderProps {
  opencvReady: boolean
}

export function Header({ opencvReady }: HeaderProps) {
  return (
    <header className="border-b border-[#d8ded9] bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between
       px-8 py-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Panorama Stitcher
          </h1>
          <p className="mt-1 text-sm text-[#68756d]">
            Create and export panoramas from multiple images
        </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              opencvReady ? 'bg-[#3f8f5b]' : 'bg-[#c58a32]'
            }`}
          />
          <span className="text-[#68756d]">
            {opencvReady ? 'OpenCV ready' : 'Loading OpenCV...'}
          </span> </div>

      </div>
    </header>
  )
}
