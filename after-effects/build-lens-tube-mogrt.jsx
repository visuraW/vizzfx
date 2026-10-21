// VizzFX Lens Tube builder for After Effects (File > Scripts > Run Script File...).
// A blurry lens-barrel ring, darkness outside it, and soft bokeh discs, exported as
// VizzFX_Lens_Tube.mogrt to the Desktop. 1920 square comp, fitted to the frame like the LED grid.
// ExtendScript (ES3): no let/const/arrow functions.

(function () {
    var S = 1920, FPS = 24, DUR = 10, MAX_BOKEH = 12;
    app.beginUndoGroup("VizzFX Lens Tube");
    var comp = app.project.items.addComp("VizzFX Lens Tube", S, S, 1, DUR, FPS);

    var ctrl = comp.layers.addNull(DUR);
    ctrl.name = "Lens Controls";
    function addCtrl(type, name, value) {
        var fx = ctrl.property("ADBE Effect Parade").addProperty(type);
        fx.name = name;
        fx.property(1).setValue(value);
    }
    addCtrl("ADBE Slider Control", "Frame Width", 1920);
    addCtrl("ADBE Slider Control", "Frame Height", 1080);
    addCtrl("ADBE Slider Control", "Ring Size", 115);        // % of frame height
    addCtrl("ADBE Slider Control", "Ring Width", 120);
    addCtrl("ADBE Slider Control", "Ring Blur", 80);
    addCtrl("ADBE Slider Control", "Ring Brightness", 55);
    addCtrl("ADBE Slider Control", "Outer Darkness", 90);
    addCtrl("ADBE Slider Control", "Bokeh Count", 7);
    addCtrl("ADBE Slider Control", "Bokeh Size", 60);
    addCtrl("ADBE Slider Control", "Bokeh Brightness", 45);
    addCtrl("ADBE Slider Control", "Seed", 3);

    var C = 'var C = thisComp.layer("Lens Controls");\n' +
            'function v(n) { return C.effect(n)("Slider"); }\n' +
            'var fw = Math.max(1, v("Frame Width")), fh = Math.max(1, v("Frame Height"));\n' +
            "var k = Math.max(fw, fh) / " + S + ";\n" +
            "var vw = fw / k, vh = fh / k;\n" +
            'var d = vh * v("Ring Size") / 100;\n';

    function addShape(name) {
        var l = comp.layers.addShape();
        l.name = name;
        l.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        l.property("ADBE Transform Group").property("ADBE Position").setValue([S / 2, S / 2]);
        return l.name;
    }
    function shape(layerName) {
        return comp.layer(layerName).property("ADBE Root Vectors Group");
    }
    // Ellipse with stroke; returns nothing (properties re-looked-up each time to avoid stale references).
    function ringGroup(layerName, sizeExpr, widthExpr, colorExpr, opacityExpr) {
        var g = shape(layerName).addProperty("ADBE Vector Group");
        g.name = "Ring";
        shape(layerName).property("Ring").property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse")
            .property("ADBE Vector Ellipse Size").expression = C + sizeExpr;
        var st = shape(layerName).property("Ring").property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Width").expression = C + widthExpr;
        st.property("ADBE Vector Stroke Color").expression = colorExpr;
        shape(layerName).property("Ring").property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity").expression = C + opacityExpr;
    }
    function blur(layerName, expr) {
        var fx = comp.layer(layerName).property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
        fx.property("ADBE Gaussian Blur 2-0001").expression = C + expr;
        comp.layer(layerName).property("ADBE Effect Parade").property(1).property("ADBE Gaussian Blur 2-0003").setValue(1);
    }

    // Darkness outside the ring: a very wide black stroke just outside it.
    var dark = addShape("Outer Darkness");
    ringGroup(dark, "[d + 4000, d + 4000];", "4000;", "[0,0,0,1];", 'v("Outer Darkness");');
    blur(dark, 'v("Ring Blur") * 0.6;');

    // The bright lens barrel.
    var ring = addShape("Lens Ring");
    ringGroup(ring, "[d, d];", 'v("Ring Width");', "[0.82,0.8,0.78,1];", 'v("Ring Brightness");');
    blur(ring, 'v("Ring Blur");');

    // Bokeh discs: random but repeatable positions inside the frame, hidden above Bokeh Count.
    for (var i = 1; i <= MAX_BOKEH; i++) {
        var b = addShape("Bokeh " + i);
        var g = shape(b).addProperty("ADBE Vector Group");
        g.name = "Disc";
        var R = C + 'seedRandom(v("Seed") * 100 + ' + i + ', true);\n' +
                "var s = v(\"Bokeh Size\") * random(0.6, 1.5);\n";
        shape(b).property("Disc").property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse")
            .property("ADBE Vector Ellipse Size").expression = R + "[s, s];";
        shape(b).property("Disc").property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill")
            .property("ADBE Vector Fill Color").setValue([0.85, 0.82, 0.78]);
        comp.layer(b).property("ADBE Transform Group").property("ADBE Position").expression =
            C + 'seedRandom(v("Seed") * 100 + ' + i + ', true);\n' +
            "[" + S / 2 + " + random(-vw * 0.45, vw * 0.45), " + S / 2 + " + random(-vh * 0.42, vh * 0.42)];";
        comp.layer(b).property("ADBE Transform Group").property("ADBE Opacity").expression =
            C + 'seedRandom(v("Seed") * 100 + ' + i + ', true);\n' +
            i + ' <= Math.round(v("Bokeh Count")) ? v("Bokeh Brightness") * random(0.5, 1.2) : 0;';
        blur(b, 'v("Bokeh Size") * 0.12;');
    }

    comp.motionGraphicsTemplateName = "VizzFX Lens Tube";
    comp.openInEssentialGraphics();
    var names = ["Frame Width", "Frame Height", "Ring Size", "Ring Width", "Ring Blur", "Ring Brightness",
                 "Outer Darkness", "Bokeh Count", "Bokeh Size", "Bokeh Brightness", "Seed"];
    for (var n = 0; n < names.length; n++) {
        comp.layer("Lens Controls").property("ADBE Effect Parade").property(names[n]).property(1)
            .addToMotionGraphicsTemplateAs(comp, names[n]);
    }
    app.endUndoGroup();

    var out = new File(Folder.desktop.fsName + "/VizzFX_Lens_Tube.mogrt");
    var ok = comp.exportAsMotionGraphicsTemplate(true, out.fsName);
    alert(ok ? "Exported " + out.fsName + "\n\nSend this file back to add it to VizzFX."
             : "The lens comp was built, but export failed.\nExport it manually: Essential Graphics panel > Export Motion Graphics Template.");
})();
