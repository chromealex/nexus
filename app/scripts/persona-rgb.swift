import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let image = NSImage(contentsOf: url)!
var rect = CGRect(origin: .zero, size: image.size)
let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
let w = cg.width, h = cg.height
var pixels = [UInt8](repeating: 0, count: w*h*4)
let context = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
context.draw(cg, in: CGRect(x: 0,y: 0,width: w,height: h))
var result = Data("P6\n\(w) \(h)\n255\n".utf8)
for i in stride(from: 0, to: pixels.count, by: 4) { result.append(contentsOf: pixels[i...i+2]) }
try result.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
