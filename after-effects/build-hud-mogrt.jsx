// VizzFX HUD builder for After Effects (File > Scripts > Run Script File...).
// Builds the thermal tracking HUD as a 1920x1080 comp, exposes its text and
// controls in Essential Graphics, and exports VizzFX_HUD.mogrt to the Desktop.
// ExtendScript (ES3): no let/const/arrow functions.

(function () {
    var W = 1920, H = 1080, FPS = 24, DUR = 10;
    var FONT = "CourierNewPSMT";
    var CTRL = 'thisComp.layer("HUD Controls")';

    app.beginUndoGroup("VizzFX HUD");
    var comp = app.project.items.addComp("VizzFX HUD", W, H, 1, DUR, FPS);
    comp.bgColor = [0, 0, 0];

    // --- Controls ---------------------------------------------------------
    var ctrl = comp.layers.addNull(DUR);
    ctrl.name = "HUD Controls";
    function addCtrl(type, name, value) {
        var fx = ctrl.property("ADBE Effect Parade").addProperty(type);
        fx.name = name;
        fx.property(1).setValue(value);
        return fx.property(1);
    }
    var pCenter = addCtrl("ADBE Point Control", "Box Center", [708, 374]);
    var pSize = addCtrl("ADBE Point Control", "Box Size", [560, 462]);
    var pColor = addCtrl("ADBE Color Control", "HUD Color", [1, 1, 1]);
    var pSpeed = addCtrl("ADBE Slider Control", "Type Speed", 40);
    var pRec = addCtrl("ADBE Checkbox Control", "Show REC", 1);
    var pLines = addCtrl("ADBE Checkbox Control", "Scanlines", 1);

    var BOX = "var c = " + CTRL + '.effect("Box Center")("Point");\n' +
              "var s = " + CTRL + '.effect("Box Size")("Point");\n' +
              "var x0 = c[0] - s[0] / 2, y0 = c[1] - s[1] / 2, x1 = c[0] + s[0] / 2, y1 = c[1] + s[1] / 2;\n";
    var COLOR = CTRL + '.effect("HUD Color")("Color")';
    var TYPE_ON = "var n = Math.max(0, Math.floor((time - inPoint) * " + CTRL + '.effect("Type Speed")("Slider")));\n' +
                  "String(value).substr(0, n);";

    function colorize(layer) {
        var fill = layer.property("ADBE Effect Parade").addProperty("ADBE Fill");
        fill.property("ADBE Fill-0002").expression = COLOR;
    }

    // --- Text helpers -------------------------------------------------------
    function addText(name, str, size, posExpr, typeOn) {
        var t = comp.layers.addText(str);
        t.name = name;
        var src = t.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = src.value;
        doc.font = FONT;
        doc.fontSize = size;
        doc.fillColor = [1, 1, 1];
        doc.applyFill = true;
        doc.applyStroke = false;
        doc.tracking = 20;
        doc.justification = ParagraphJustification.LEFT_JUSTIFY;
        doc.leading = Math.round(size * 1.45);
        src.setValue(doc);
        t.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        if (typeof posExpr === "string") t.property("ADBE Transform Group").property("ADBE Position").expression = posExpr;
        else t.property("ADBE Transform Group").property("ADBE Position").setValue(posExpr);
        if (typeOn) src.expression = TYPE_ON;
        colorize(t);
        return src;
    }

    // --- Shapes -------------------------------------------------------------
    function addShapeLayer(name) {
        var s = comp.layers.addShape();
        s.name = name;
        s.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        s.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        return s;
    }
    // A stroked path whose points come from an expression (comp coordinates).
    function addPath(layer, name, pathExpr, width, opacity) {
        var g = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        g.name = name;
        var v = g.property("ADBE Vectors Group");
        var p = v.addProperty("ADBE Vector Shape - Group");
        p.property("ADBE Vector Shape").expression = pathExpr;
        var st = v.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Width").setValue(width);
        st.property("ADBE Vector Stroke Color").expression = COLOR;
        if (opacity !== undefined) st.property("ADBE Vector Stroke Opacity").setValue(opacity);
        return g;
    }
    function bracket(xA, yA, xB, yB, xC, yC) {
        return BOX + "var L = Math.min(s[0], s[1]) * 0.14;\n" +
               "createPath([[" + xA + "," + yA + "],[" + xB + "," + yB + "],[" + xC + "," + yC + "]], [], [], false);";
    }

    // Tracking box: corner brackets, thin outline, eye box, crosshair.
    var box = addShapeLayer("Tracking Box");
    addPath(box, "TL", bracket("x0", "y0 + L", "x0", "y0", "x0 + L", "y0"), 3);
    addPath(box, "TR", bracket("x1 - L", "y0", "x1", "y0", "x1", "y0 + L"), 3);
    addPath(box, "BL", bracket("x0", "y1 - L", "x0", "y1", "x0 + L", "y1"), 3);
    addPath(box, "BR", bracket("x1 - L", "y1", "x1", "y1", "x1", "y1 - L"), 3);
    addPath(box, "Outline", BOX + "createPath([[x0+6,y0+8],[x1-6,y0+8],[x1-6,y1-8],[x0+6,y1-8]], [], [], true);", 1, 35);
    addPath(box, "Eye Box", BOX +
        "var ex = x0 + s[0] * 0.41, ey = y0 + s[1] * 0.135, ew = s[0] * 0.445, eh = s[1] * 0.325;\n" +
        "createPath([[ex,ey],[ex+ew,ey],[ex+ew,ey+eh],[ex,ey+eh]], [], [], true);", 1.5, 90);
    addPath(box, "Cross H", BOX + "createPath([[c[0]-30,c[1]],[c[0]-12,c[1]],[c[0]+12,c[1]],[c[0]+30,c[1]]], [], [], false);", 1.5, 80);
    addPath(box, "Cross V", BOX + "createPath([[c[0],c[1]-28],[c[0],c[1]-14]], [], [], false);", 1.5, 80);

    // Box labels follow the box.
    var tTitle = addText("Title", "GR33N.EXE", 26, BOX + "[x0, y0 - 14];", true);
    var tLens = addText("Lens Label", "LENS:R3D", 19, BOX + "[x0 + s[0] * 0.875, y0 + s[1] * 0.17];", true);
    var tId = addText("ID Line", "ID:DR.GR33N  MATCH 98.6%   SUBJ_01", 19, BOX + "[x0, y1 + 28];", true);

    // Info block (top-left) with a rule above it and a live frame counter.
    var info = addShapeLayer("Info Rule");
    addPath(info, "Rule", "createPath([[60,52],[330,52]], [], [], false);", 1, 60);
    var tInfo = addText("Info Block", "THERMAL // IR-7\rTEMP  36.0 C\rTRACK ▸ LOCKED", 19, [60, 77], true);
    var fr = comp.layers.addText("FR:04594");
    fr.name = "Frame Counter";
    var frDoc = fr.property("ADBE Text Properties").property("ADBE Text Document");
    var d = frDoc.value; d.font = FONT; d.fontSize = 19; d.fillColor = [1, 1, 1]; d.tracking = 20;
    d.justification = ParagraphJustification.LEFT_JUSTIFY; frDoc.setValue(d);
    fr.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
    fr.property("ADBE Transform Group").property("ADBE Position").setValue([60, 161]);
    frDoc.expression = '"FR:" + ("00000" + (4594 + timeToFrames(time - inPoint))).slice(-5);';
    colorize(fr);
    addText("SIG Label", "SIG", 19, [60, 189], false);
    var sig = addShapeLayer("SIG Bar");
    var sg = sig.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var rect = sg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([88, 16]);
    rect.property("ADBE Vector Rect Position").setValue([149, 183]);
    var sf = sg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    sf.property("ADBE Vector Fill Color").expression = COLOR;
    sig.property("ADBE Transform Group").property("ADBE Opacity").expression = "60 + wiggle(12, 30) - value;";

    // REC indicator (top-right), blinking.
    var rec = addShapeLayer("REC Dot");
    var rg = rec.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var el = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
    el.property("ADBE Vector Ellipse Size").setValue([17, 17]);
    el.property("ADBE Vector Ellipse Position").setValue([1818, 70]);
    var rf = rg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    rf.property("ADBE Vector Fill Color").setValue([0.85, 0.12, 0.1]);
    var REC_ON = CTRL + '.effect("Show REC")("Checkbox") == 0 ? 0 : ';
    rec.property("ADBE Transform Group").property("ADBE Opacity").expression = REC_ON + "(Math.floor(time * 2) % 2 ? 100 : 35);";
    addText("REC Label", "REC", 19, [1836, 76], false);
    comp.layer("REC Label").property("ADBE Transform Group").property("ADBE Opacity").expression = REC_ON + "100;";

    // Scanlines: thin horizontal lines across the frame at low opacity.
    var sl = comp.layers.addSolid([0, 0, 0], "Scanlines", W, H, 1, DUR);
    var vb = sl.property("ADBE Effect Parade").addProperty("ADBE Venetian Blinds");
    vb.property("ADBE Venetian Blinds-0001").setValue(50);
    vb.property("ADBE Venetian Blinds-0002").setValue(0);
    vb.property("ADBE Venetian Blinds-0003").setValue(3);
    sl.property("ADBE Transform Group").property("ADBE Opacity").expression =
        CTRL + '.effect("Scanlines")("Checkbox") == 0 ? 0 : 18;';
    sl.moveToEnd();

    // --- Essential Graphics -----------------------------------------------------
    comp.motionGraphicsTemplateName = "VizzFX HUD";
    comp.openInEssentialGraphics();
    tTitle.addToMotionGraphicsTemplateAs(comp, "Title");
    tId.addToMotionGraphicsTemplateAs(comp, "ID Line");
    tLens.addToMotionGraphicsTemplateAs(comp, "Lens Label");
    tInfo.addToMotionGraphicsTemplateAs(comp, "Info Block");
    pCenter.addToMotionGraphicsTemplateAs(comp, "Box Center");
    pSize.addToMotionGraphicsTemplateAs(comp, "Box Size");
    pColor.addToMotionGraphicsTemplateAs(comp, "HUD Color");
    pSpeed.addToMotionGraphicsTemplateAs(comp, "Type Speed");
    pRec.addToMotionGraphicsTemplateAs(comp, "Show REC");
    pLines.addToMotionGraphicsTemplateAs(comp, "Scanlines");
    app.endUndoGroup();

    var out = new File(Folder.desktop.fsName + "/VizzFX_HUD.mogrt");
    var ok = comp.exportAsMotionGraphicsTemplate(true, out.fsName);
    alert(ok ? "Exported " + out.fsName + "\n\nSend this file back to add it to VizzFX."
             : "The HUD comp was built, but export failed.\nExport it manually: Essential Graphics panel > Export Motion Graphics Template.");
})();
