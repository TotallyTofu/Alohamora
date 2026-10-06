// alohamora-drag-helper — prints JSON lines describing global file drags + modifier keys.
// Build: swiftc -O -target arm64-apple-macos12 -o alohamora-drag-helper DragHelper.swift  (x86_64 for Intel)
import AppKit
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)          // line-buffered so Node receives each event immediately

func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
}

let dragBoard = NSPasteboard(name: .drag)
var lastChange = dragBoard.changeCount
var mouseDown = false
var dragActive = false          // a NEW drag pasteboard was written while the button is down
var filesSent = false
var lastShift = false
var lastAlt = false

func readDraggedFiles() -> [String] {
    let opts: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
    let urls = dragBoard.readObjects(forClasses: [NSURL.self], options: opts) as? [URL] ?? []
    return urls.map { $0.path }
}

let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { _ in
    let buttons = NSEvent.pressedMouseButtons
    let flags = NSEvent.modifierFlags
    let shift = flags.contains(.shift)
    let alt = flags.contains(.option)
    let down = (buttons & 1) == 1

    if down && !mouseDown { mouseDown = true; dragActive = false; filesSent = false; lastChange = dragBoard.changeCount }
    if down && !dragActive && dragBoard.changeCount != lastChange {
        dragActive = true                                   // something new is being dragged
        emit(["t": "drag"])
    }
    if dragActive && (shift != lastShift || alt != lastAlt) {
        emit(["t": "mods", "shift": shift, "alt": alt])
    }
    if dragActive && shift && !filesSent {
        filesSent = true                                    // read contents only when the user shows intent (⇧)
        emit(["t": "files", "paths": readDraggedFiles()])
    }
    if !down && mouseDown {
        mouseDown = false
        if dragActive { emit(["t": "up"]) }
        dragActive = false
    }
    lastShift = shift
    lastAlt = alt
}
RunLoop.main.add(timer, forMode: .common)

// Exit when the parent (Electron) closes our stdin.
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
emit(["t": "ready"])
RunLoop.main.run()
