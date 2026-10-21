// VizzFX LED grid builder for After Effects (File > Scripts > Run Script File...).
// Builds the LED pixel gaps and subpixel lines as a template that sits above a clip
// with VizzFX's Mosaic, and exports VizzFX_LED_Grid.mogrt to the Desktop.
// The comp is 1920 square so it covers both 16:9 and 9:16 frames; VizzFX scales it for larger ones.
// ExtendScript (ES3): no let/const/arrow functions.

(function () {
    var S = 1920, FPS = 24, DUR = 10;
    app.beginUndoGroup("VizzFX LED Grid");
    var comp = app.project.items.addComp("VizzFX LED Grid", S, S, 1, DUR, FPS);

    // --- Controls (VizzFX sets Rows and Frame Width/Height to match its Mosaic) ---
    var ctrl = comp.layers.addNull(DUR);
    ctrl.name = "LED Controls";
    function addCtrl(type, name, value) {
        var fx = ctrl.property("ADBE Effect Parade").addProperty(type);
        fx.name = name;
        fx.property(1).setValue(value);
    }
    addCtrl("ADBE Slider Control", "Rows", 54);
    addCtrl("ADBE Slider Control", "Frame Width", 1920);
    addCtrl("ADBE Slider Control", "Frame Height", 1080);
    addCtrl("ADBE Slider Control", "Gap %", 18);
    addCtrl("ADBE Slider Control", "Gap Opacity", 85);
    addCtrl("ADBE Checkbox Control", "Subpixels", 1);
    addCtrl("ADBE Slider Control", "Subpixel Opacity", 35);

    // Grid geometry in comp space: the visible frame is centered and scaled to fit the square comp.
    var GEO = 'var C = thisComp.layer("LED Controls");\n' +
              'var rows = Math.max(1, Math.round(C.effect("Rows")("Slider")));\n' +
              'var fw = Math.max(1, C.effect("Frame Width")("Slider")), fh = Math.max(1, C.effect("Frame Height")("Slider"));\n' +
              "var k = Math.max(fw, fh) / " + S + ";\n" +
              "var vw = fw / k, vh = fh / k;\n" +
              "var cols = Math.max(1, Math.round(rows * fw / fh));\n" +
              "var cw = vw / cols, ch = vh / rows;\n" +
              "var x0 = " + (S / 2) + " - vw / 2, y0 = " + (S / 2) + " - vh / 2;\n" +
              'var g = C.effect("Gap %")("Slider") / 100;\n';

    var layer = comp.layers.addShape();
    layer.name = "LED Gaps";
    layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);

    // One group = a black bar repeated across the frame.
    function addBars(name, sizeExpr, posExpr, copiesExpr, offsetExpr, opacityExpr) {
        var grp = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        grp.name = name;
        var rect = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").expression = GEO + sizeExpr;
        rect.property("ADBE Vector Rect Position").expression = GEO + posExpr;
        var fill = layer.property("ADBE Root Vectors Group").property(name)
            .property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([0, 0, 0]);
        var rep = layer.property("ADBE Root Vectors Group").property(name)
            .property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Repeater");
        rep.property("ADBE Vector Repeater Copies").expression = GEO + copiesExpr;
        rep.property("ADBE Vector Repeater Transform").property("ADBE Vector Repeater Position").expression = GEO + offsetExpr;
        layer.property("ADBE Root Vectors Group").property(name)
            .property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity").expression = opacityExpr;
    }

    var GAP_OPACITY = 'thisComp.layer("LED Controls").effect("Gap Opacity")("Slider");';
    var SUB_OPACITY = 'var C = thisComp.layer("LED Controls");\n' +
                      'C.effect("Subpixels")("Checkbox") == 0 ? 0 : C.effect("Subpixel Opacity")("Slider");';

    // Horizontal gaps between pixel rows, and vertical gaps between columns.
    addBars("Row Gaps", "[vw, Math.max(0.5, ch * g)];", "[" + (S / 2) + ", y0];", "rows + 1;", "[0, ch];", GAP_OPACITY);
    addBars("Column Gaps", "[Math.max(0.5, cw * g), vh];", "[x0, " + (S / 2) + "];", "cols + 1;", "[cw, 0];", GAP_OPACITY);
    // Thin lines splitting each pixel into three subpixel stripes.
    addBars("Subpixel A", "[Math.max(0.5, cw * g * 0.4), vh];", "[x0 + cw / 3, " + (S / 2) + "];", "cols;", "[cw, 0];", SUB_OPACITY);
    addBars("Subpixel B", "[Math.max(0.5, cw * g * 0.4), vh];", "[x0 + cw * 2 / 3, " + (S / 2) + "];", "cols;", "[cw, 0];", SUB_OPACITY);

    // --- Essential Graphics (look properties up by name; earlier references go stale) ---
    comp.motionGraphicsTemplateName = "VizzFX LED Grid";
    comp.openInEssentialGraphics();
    var names = ["Rows", "Frame Width", "Frame Height", "Gap %", "Gap Opacity", "Subpixels", "Subpixel Opacity"];
    for (var i = 0; i < names.length; i++) {
        comp.layer("LED Controls").property("ADBE Effect Parade").property(names[i]).property(1)
            .addToMotionGraphicsTemplateAs(comp, names[i]);
    }
    app.endUndoGroup();

    var out = new File(Folder.desktop.fsName + "/VizzFX_LED_Grid.mogrt");
    var ok = comp.exportAsMotionGraphicsTemplate(true, out.fsName);
    alert(ok ? "Exported " + out.fsName + "\n\nSend this file back to add it to VizzFX."
             : "The grid comp was built, but export failed.\nExport it manually: Essential Graphics panel > Export Motion Graphics Template.");
})();
