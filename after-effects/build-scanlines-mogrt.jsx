// VizzFX: builds the CRT scanlines template (File > Scripts > Run Script File...):
//   VizzFX_Scanlines.mogrt - used by CRT Lines and CRT TV
// A 1920 square comp fitted to the frame by VizzFX (Frame Width/Height).
// ExtendScript (ES3): no let/const/arrow functions. Properties are always looked up
// fresh by name, because adding effects/layers invalidates earlier references.

(function () {
    var S = 1920, FPS = 24, DUR = 10;
    var results = [];

    function controls(comp, layerName, list) {
        var l = comp.layers.addNull(DUR);
        l.name = layerName;
        for (var i = 0; i < list.length; i++) {
            var fx = comp.layer(layerName).property("ADBE Effect Parade").addProperty(list[i][0]);
            fx.name = list[i][1];
            comp.layer(layerName).property("ADBE Effect Parade").property(list[i][1]).property(1).setValue(list[i][2]);
        }
    }
    function expose(comp, layerName, list) {
        comp.openInEssentialGraphics();
        for (var i = 0; i < list.length; i++) {
            comp.layer(layerName).property("ADBE Effect Parade").property(list[i][1]).property(1)
                .addToMotionGraphicsTemplateAs(comp, list[i][1]);
        }
    }
    function exportTemplate(comp, file) {
        var out = new File(Folder.desktop.fsName + "/" + file);
        results.push((comp.exportAsMotionGraphicsTemplate(true, out.fsName) ? "Exported " : "FAILED ") + out.fsName);
    }
    function frameGeo(ctrlName) {
        return 'var C = thisComp.layer("' + ctrlName + '");\n' +
               'function v(n) { return C.effect(n)(1); }\n' +
               'var fw = Math.max(1, v("Frame Width")), fh = Math.max(1, v("Frame Height"));\n' +
               "var k = Math.max(fw, fh) / " + S + ";\n" +
               "var vw = fw / k, vh = fh / k;\n" +
               "var x0 = " + S / 2 + " - vw / 2, y0 = " + S / 2 + " - vh / 2;\n";
    }
    function centeredShape(comp, name) {
        var l = comp.layers.addShape();
        l.name = name;
        comp.layer(name).property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        comp.layer(name).property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        return name;
    }
    function group(comp, layerName, groupName) {
        var g = comp.layer(layerName).property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        g.name = groupName;
        return function () {
            return comp.layer(layerName).property("ADBE Root Vectors Group").property(groupName).property("ADBE Vectors Group");
        };
    }
    function gaussian(comp, layerName, expr) {
        comp.layer(layerName).property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
        var fx = comp.layer(layerName).property("ADBE Effect Parade").property("ADBE Gaussian Blur 2");
        fx.property("ADBE Gaussian Blur 2-0001").expression = expr;
        comp.layer(layerName).property("ADBE Effect Parade").property("ADBE Gaussian Blur 2").property("ADBE Gaussian Blur 2-0003").setValue(1);
    }

    app.beginUndoGroup("VizzFX Scanlines");

    // ---------------------------------------------------------------- Scanlines
    try {
        var sc = app.project.items.addComp("VizzFX Scanlines", S, S, 1, DUR, FPS);
        var SC = [
            ["ADBE Slider Control", "Frame Width", 1920],
            ["ADBE Slider Control", "Frame Height", 1080],
            ["ADBE Slider Control", "Lines", 180],
            ["ADBE Slider Control", "Thickness %", 45],
            ["ADBE Slider Control", "Line Opacity", 60],
            ["ADBE Slider Control", "Roll Speed", 0],
            ["ADBE Slider Control", "Flicker", 0]
        ];
        controls(sc, "CRT Controls", SC);
        var G = frameGeo("CRT Controls") +
                'var n = Math.max(1, Math.round(v("Lines")));\n' +
                "var ch = vh / n;\n" +
                'var roll = (time * v("Roll Speed")) % ch;\n';
        var lines = centeredShape(sc, "Lines");
        var vec = group(sc, lines, "Bar");
        vec().addProperty("ADBE Vector Shape - Rect");
        vec().property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").expression =
            G + '[vw, Math.max(0.5, ch * v("Thickness %") / 100)];';
        vec().property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Position").expression =
            G + "[" + S / 2 + ", y0 + ch / 2 + roll - ch];";
        vec().addProperty("ADBE Vector Graphic - Fill");
        vec().property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0, 0]);
        vec().addProperty("ADBE Vector Filter - Repeater");
        vec().property("ADBE Vector Filter - Repeater").property("ADBE Vector Repeater Copies").expression = G + "n + 2;";
        vec().property("ADBE Vector Filter - Repeater").property("ADBE Vector Repeater Transform")
            .property("ADBE Vector Repeater Position").expression = G + "[0, ch];";
        sc.layer(lines).property("ADBE Transform Group").property("ADBE Opacity").expression =
            frameGeo("CRT Controls") + 'v("Line Opacity") * (1 - v("Flicker") / 100 * random());';
    } catch (e) {
        results.push("Scanlines build failed: " + e.toString() + " (line " + e.line + ")");
    }
    try {
        sc.motionGraphicsTemplateName = "VizzFX Scanlines";
        expose(sc, "CRT Controls", SC);
        exportTemplate(sc, "VizzFX_Scanlines.mogrt");
    } catch (e2) {
        results.push("Scanlines failed: " + e2.toString() + " (line " + e2.line + ")");
    }

    app.endUndoGroup();
    alert(results.join("\n") + "\n\nSend the .mogrt file back to add it to VizzFX.");
})();
