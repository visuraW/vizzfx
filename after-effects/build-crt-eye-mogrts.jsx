// VizzFX: builds two templates in one run (File > Scripts > Run Script File...):
//   VizzFX_Scanlines.mogrt  - CRT scanlines (used by CRT Lines and CRT TV)
//   VizzFX_Eye.mogrt        - eye overlay: breathing pupil, drifting iris fibers, dark surround
// Both are 1920 square comps fitted to the frame by VizzFX (Frame Width/Height).
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

    app.beginUndoGroup("VizzFX CRT + Eye");

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

    // ---------------------------------------------------------------- Eye
    try {
        var ey = app.project.items.addComp("VizzFX Eye", S, S, 1, DUR, FPS);
        var EY = [
            ["ADBE Slider Control", "Frame Width", 1920],
            ["ADBE Slider Control", "Frame Height", 1080],
            ["ADBE Slider Control", "Pupil Size", 30],      // % of frame height
            ["ADBE Slider Control", "Pupil Pulse", 8],      // % breathing
            ["ADBE Slider Control", "Pulse Speed", 0.4],    // breaths per second
            ["ADBE Slider Control", "Iris Size", 120],      // % of frame height
            ["ADBE Slider Control", "Fiber Opacity", 60],
            ["ADBE Slider Control", "Fiber Detail", 50],
            ["ADBE Slider Control", "Rotation Speed", 4],   // degrees per second
            ["ADBE Slider Control", "Outer Darkness", 85],
            ["ADBE Slider Control", "Softness", 6],
            ["ADBE Checkbox Control", "Catchlight", 1]
        ];
        controls(ey, "Eye Controls", EY);
        var E = frameGeo("Eye Controls");

        // Iris fibers: stretched fractal noise wrapped into polar coordinates -> radial streaks.
        ey.layers.addSolid([0, 0, 0], "Iris Fibers", S, S, 1, DUR);
        var fib = function () { return ey.layer("Iris Fibers"); };
        fib().property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
        var fn = function () { return fib().property("ADBE Effect Parade").property("ADBE Fractal Noise"); };
        function setFn(name, value, expr) {
            try {
                if (expr) fn().property(name).expression = expr;
                else fn().property(name).setValue(value);
            } catch (e) { /* property name differs in this AE version */ }
        }
        setFn("Contrast", 220);
        setFn("Brightness", -25);
        setFn("Uniform Scaling", 0);
        setFn("Scale Width", 0, E + "Math.max(2, 30 - v(\"Fiber Detail\") * 0.25);");
        setFn("Scale Height", 900);
        setFn("Complexity", 6);
        setFn("Evolution", 0, "time * 40;");
        fib().property("ADBE Effect Parade").addProperty("ADBE Polar Coordinates");
        try {
            fib().property("ADBE Effect Parade").property("ADBE Polar Coordinates").property(1).setValue(100); // Interpolation
            fib().property("ADBE Effect Parade").property("ADBE Polar Coordinates").property(2).setValue(1);   // Rect to Polar
        } catch (e3) { /* defaults */ }
        // Bright noise becomes opaque black fibers; the video shows between them.
        fib().property("ADBE Effect Parade").addProperty("ADBE Shift Channels");
        try {
            fib().property("ADBE Effect Parade").property("ADBE Shift Channels").property(1).setValue(5); // Alpha from Luminance
        } catch (e4) { /* default */ }
        fib().property("ADBE Effect Parade").addProperty("ADBE Fill");
        fib().property("ADBE Effect Parade").property("ADBE Fill").property("ADBE Fill-0002").setValue([0, 0, 0]);
        gaussian(ey, "Iris Fibers", E + "v(\"Softness\") * 0.5;");
        fib().property("ADBE Transform Group").property("ADBE Rotate Z").expression = E + "time * v(\"Rotation Speed\");";
        fib().property("ADBE Transform Group").property("ADBE Opacity").expression = E + "v(\"Fiber Opacity\");";
        fib().property("ADBE Transform Group").property("ADBE Scale").expression =
            E + "var s = v(\"Iris Size\") * vh / " + S + " * 1.15; [s, s];";

        // Dark surround outside the iris, and a soft limbal ring at its edge.
        var outer = centeredShape(ey, "Outer Darkness");
        ey.layer(outer).property("ADBE Transform Group").property("ADBE Position").setValue([S / 2, S / 2]);
        var ov = group(ey, outer, "Ring");
        ov().addProperty("ADBE Vector Shape - Ellipse");
        ov().property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").expression =
            E + "var d = vh * v(\"Iris Size\") / 100; [d + 4000, d + 4000];";
        ov().addProperty("ADBE Vector Graphic - Stroke");
        ov().property("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Width").setValue(4000);
        ov().property("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Color").setValue([0, 0, 0]);
        ey.layer(outer).property("ADBE Transform Group").property("ADBE Opacity").expression = E + "v(\"Outer Darkness\");";
        gaussian(ey, outer, E + "v(\"Softness\") * 8;");

        // Pupil: soft black disc that breathes.
        var pupil = centeredShape(ey, "Pupil");
        ey.layer(pupil).property("ADBE Transform Group").property("ADBE Position").setValue([S / 2, S / 2]);
        var pv = group(ey, pupil, "Disc");
        pv().addProperty("ADBE Vector Shape - Ellipse");
        pv().property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").expression =
            E + "var d = vh * v(\"Pupil Size\") / 100 * (1 + v(\"Pupil Pulse\") / 100 * Math.sin(time * Math.PI * 2 * v(\"Pulse Speed\"))); [d, d];";
        pv().addProperty("ADBE Vector Graphic - Fill");
        pv().property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([0, 0, 0]);
        gaussian(ey, pupil, E + "v(\"Softness\") * 4;");

        // Catchlight: two small reflections in the pupil.
        var cat = centeredShape(ey, "Catchlight");
        ey.layer(cat).property("ADBE Transform Group").property("ADBE Position").expression =
            E + "[" + S / 2 + ", " + S / 2 + " - vh * v(\"Pupil Size\") / 100 * 0.18];";
        var cv = group(ey, cat, "Dots");
        cv().addProperty("ADBE Vector Shape - Ellipse");
        cv().property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").expression =
            E + "var d = vh * v(\"Pupil Size\") / 100 * 0.07; [d * 1.4, d];";
        cv().addProperty("ADBE Vector Graphic - Fill");
        cv().property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([1, 1, 1]);
        cv().addProperty("ADBE Vector Filter - Repeater");
        cv().property("ADBE Vector Filter - Repeater").property("ADBE Vector Repeater Copies").setValue(2);
        cv().property("ADBE Vector Filter - Repeater").property("ADBE Vector Repeater Transform")
            .property("ADBE Vector Repeater Position").expression = E + "[0, vh * v(\"Pupil Size\") / 100 * 0.1];";
        ey.layer(cat).property("ADBE Transform Group").property("ADBE Opacity").expression =
            'thisComp.layer("Eye Controls").effect("Catchlight")(1) == 0 ? 0 : 85;';
        gaussian(ey, cat, "1.5;");

        ey.motionGraphicsTemplateName = "VizzFX Eye";
        expose(ey, "Eye Controls", EY);
        exportTemplate(ey, "VizzFX_Eye.mogrt");
    } catch (e5) {
        results.push("Eye failed: " + e5.toString() + " (line " + e5.line + ")");
    }

    app.endUndoGroup();
    alert(results.join("\n") + "\n\nSend the .mogrt files back to add them to VizzFX.");
})();
