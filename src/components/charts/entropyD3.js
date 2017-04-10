import _ from "lodash";
import { lightGrey, medGrey, darkGrey } from "../../globalStyles";
import { select, event } from "d3-selection";
import { scaleLinear } from "d3-scale";
import { axisBottom, axisLeft } from "d3-axis";
import { zoom, zoomIdentity } from "d3-zoom";
import { brushX } from "d3-brush";
import Mousetrap from "mousetrap";

/* constructor - sed up data and store params */
const EntropyChart = function (ref, data, callbacks) {
  this.svg = select(ref);
  this.data = data;
  this.callbacks = callbacks;
  this.processAnnotations();
  for (const nt of this.data.entropyNtWithoutZeros) {
    nt.prot = this.intersectGenes(nt.x);
  }
  // console.log(this.data)
};

/* the annotation order in JSON is not necessarily sorted */
EntropyChart.prototype.processAnnotations = function () {
  const m = {};
  this.data.annotations.map((d) => {
    m[d.prot] = d;
  });
  const sorted = Object.keys(m).sort((a, b) =>
    m[a].start < m[b].start ? -1 : m[a].start > m[b].start ? 1 : 0
  );
  for (const gene in m) {
    m[gene].idx = sorted.indexOf(gene);
  }
  this.geneMap = m;
};

EntropyChart.prototype.intersectGenes = function (pos) {
  for (const gene in this.geneMap) {
    if (pos >= this.geneMap[gene].start && pos <= this.geneMap[gene].end) {
      return gene;
    }
  }
  return false;
};

/* convert amino acid X in gene Y to a nucleotide number */
EntropyChart.prototype.aaToNtCoord = function (gene, aaPos) {
  return this.geneMap[gene].start + aaPos * 3;
};

/* draw the genes (annotations) */
EntropyChart.prototype.drawGenes = function (annotations) {
  const geneHeight = 20;
  const readingFrameOffset = (frame) => 5
  const selection = this.navGraph.selectAll(".gene")
    .data(annotations)
    .enter()
    .append("g");
  selection.append("rect")
    .attr("class", "gene")
    .attr("x", (d) => this.scales.xNav(d.start))
    .attr("y", (d) => readingFrameOffset(d.readingFrame))
    .attr("width", (d) => this.scales.xNav(d.end) - this.scales.xNav(d.start))
    .attr("height", geneHeight)
    .style("fill", (d) => d.fill)
    .style("stroke", () => "white");
  selection.append("text")
    .attr("x", (d) =>
      this.scales.xNav(d.start) + (this.scales.xNav(d.end) - this.scales.xNav(d.start)) / 2
    )
    .attr("y", (d) => readingFrameOffset(d.readingFrame) + 5)
    .attr("dy", ".7em")
    .attr("text-anchor", "middle")
    .style("fill", () => "white")
    .text((d) => d.prot);
};

EntropyChart.prototype.drawAA = function (el, w) {
  el.data(this.data.aminoAcidEntropyWithoutZeros)
    .enter().append("rect")
      .attr("class", "bar")
      .attr("id", (d) => d.prot + d.codon)
      .attr("x", (d) => this.scales.xMain(this.aaToNtCoord(d.prot, d.codon)))
      .attr("y", (d) => this.scales.y(d.y))
      .attr("width", w)
      .attr("height", (d) => this.offsets.heightMain - this.scales.y(d.y))
      .style("fill", (d) => this.geneMap[d.prot].idx % 2 ? medGrey : darkGrey)
      .on("mouseover", (d) => {
        this.callbacks.onHover(d, event.pageX, event.pageY);
      })
      .on("mouseout", (d) => {
        this.callbacks.onLeave(d);
      })
      .on("click", (d) => {
        this.callbacks.onClick(d);
        /* clear any previously selected bars */
        select("#entropySelected")
          .attr("id", (node) => node.prot + node.codon)
          .style("fill", (node) => this.geneMap[node.prot].idx % 2 ? medGrey : darkGrey);
        select("#" + d.prot + d.codon)
          .attr("id", "entropySelected")
          .style("fill", () => this.geneMap[d.prot].fill);
      })
      .style("cursor", "pointer");
};

EntropyChart.prototype.drawNt = function (el, w) {
  el.data(this.data.entropyNtWithoutZeros)
    .enter().append("rect")
      .attr("class", "bar")
      .attr("id", (d) => "nt" + d.x)
      .attr("x", (d) => this.scales.xMain(d.x))
      .attr("y", (d) => this.scales.y(d.y))
      .attr("width", w)
      .attr("height", (d) => this.offsets.heightMain - this.scales.y(d.y))
      .style("fill", (d) => {
        if (d.prot) {
          return (this.geneMap[d.prot].idx % 2) ? medGrey : darkGrey;
        }
        return lightGrey;
      })
      .on("mouseover", (d) => {
        this.callbacks.onHover(d, event.pageX, event.pageY);
      })
      .on("mouseout", (d) => {
        this.callbacks.onLeave(d);
      })
      .on("click", (d) => {
        this.callbacks.onClick(d);
        /* clear any previously selected bars */
        select("#entropySelected")
          .attr("id", (node) => "nt" + node.x)
          .style("fill", (node) => {
            if (node.prot) {
              return (this.geneMap[node.prot].idx % 2) ? medGrey : darkGrey;
            }
            return lightGrey;
          });
        select("#nt" + d.x)
          .attr("id", "entropySelected")
          .style("fill", () => {
            if (d.prot) {
              return this.geneMap[d.prot].fill;
            }
            return "red";
          });
      })
      .style("cursor", "pointer");
};

/* draw the bars (for each base / aa) */
EntropyChart.prototype.drawBars = function () {
  this.mainGraph.selectAll("*").remove();
  let posInView = this.scales.xMain.domain()[1] - this.scales.xMain.domain()[0];
  if (this.aa) {
    posInView /= 3;
  }
  const barWidth = posInView > 10000 ? 1 : posInView > 1000 ? 2 : posInView > 100 ? 3 : 5;
  const chart = this.mainGraph.append("g")
    .attr("clip-path", "url(#clip)")
    .selectAll(".bar");
  if (this.aa) {
    this.drawAA(chart, barWidth);
  } else {
    this.drawNt(chart, barWidth);
  }
};

EntropyChart.prototype.updateMutType = function (aa) {
  if (aa !== this.aa) {
    this.aa = aa;
    this.drawBars();
  }
};

/* set scales - normally use this.scales.y, this.scales.xMain, this.scales.xNav */
EntropyChart.prototype.setScales = function (chartGeom, xMax, yMax) {
  this.scales = {};
  this.scales.xMax = xMax;
  this.scales.yMax = yMax;
  this.scales.yMin = 0; //-0.11 * yMax;
  this.scales.xMin = 0;
  this.scales.xMainOriginal = scaleLinear()
    .domain([0, xMax])
    // .range([0, this.offsets.width])
    .range([this.offsets.x1, this.offsets.x2]);
  this.scales.xMain = this.scales.xMainOriginal;
  this.scales.xNav = scaleLinear()
    .domain([0, xMax])
    .range([this.offsets.x1, this.offsets.x2]);
  this.scales.y = scaleLinear()
    .domain([this.scales.yMin, 1.2 * yMax])
    .range([this.offsets.y2Main, this.offsets.y1Main]);
};

/* calculate the offsets */
EntropyChart.prototype.calcOffsets = function (chartGeom) {
  this.offsets = {
    x1: chartGeom.padLeft,
    x2: chartGeom.width - chartGeom.padRight - 20,
    y1Main: 0, /* remember y1 is the top, y2 is the bottom, measured going down */
    y1Nav: chartGeom.height - chartGeom.padBottom - 30,
    y2Main: chartGeom.height - chartGeom.padBottom - 50,
    y2Nav: chartGeom.height - chartGeom.padBottom
  };
  this.offsets.heightMain = this.offsets.y2Main - this.offsets.y1Main;
  this.offsets.heightNav = this.offsets.y2Nav - this.offsets.y1Nav;
  this.offsets.width = this.offsets.x2 - this.offsets.x1;
};

/* initial render - set up zooming etc */
EntropyChart.prototype.render = function (chartGeom, aa) {
  this.aa = aa; /* bool */
  this.calcOffsets(chartGeom);
  this.setScales(
    chartGeom,
    this.data.entropyNt.length + 1,
    Math.max(
      _.maxBy(this.data.entropyNtWithoutZeros, "y").y,
      _.maxBy(this.data.aminoAcidEntropyWithoutZeros, "y").y
    )
  );

  /* tear things down */
  this.svg.selectAll("*").remove();

  // set up a zoom overlay (else clicking on whitespace won't zoom)
  const zoomExtents = [
    [this.offsets.x1, this.offsets.y1],
    [this.offsets.width, this.offsets.y2Main]
  ];
  this.zoom = zoom()
    .scaleExtent([1, 8])
    .translateExtent(zoomExtents)
    .extent(zoomExtents)
    .on("zoom", () => this.zoomed());

  /* the overlay should be dependent on whether you have certain keys pressed */
  const zoomKeys = ["option"];
  Mousetrap.bind(zoomKeys, () => {
    this.svg.append("rect")
      .attr("class", "overlay")
      .attr("transform", "translate(" + this.offsets.x1 + "," + this.offsets.y1Main + ")")
      .attr("width", this.offsets.width)
      .attr("height", this.offsets.y2Nav + 30 - this.offsets.y1Main)
      .call(this.zoom)
      .on("wheel", () => { event.preventDefault(); });
  }, "keydown");
  Mousetrap.bind(zoomKeys, () => {
    this.svg.selectAll(".overlay").remove();
  }, "keyup");

  /* construct axes */
  this.axes = {};
  this.axes.y = axisLeft(this.scales.y).ticks(4);
  this.axes.xMain = axisBottom(this.scales.xMain).ticks(20);
  this.axes.xNav = axisBottom(this.scales.xNav).ticks(20);

  /* prepare graph elements to be drawn in */
  this.mainGraph = this.svg.append("g")
    .attr("class", "main")
    .attr("transform", "translate(" + this.offsets.x1 + "," + this.offsets.y1Main + ")");
  this.navGraph = this.svg.append("g")
    .attr("class", "nav")
    .attr("transform", "translate(" + this.offsets.x1 + "," + this.offsets.y1Nav + ")")

  /* draw axes */
  this.svg.append("g")
      .attr("class", "y axis")
      .attr("id", "entropyYAxis")
      /* no idea why the 15 is needed here */
      .attr("transform", "translate(" + (this.offsets.x1 + 15) + "," + this.offsets.y1Main + ")")
      .call(this.axes.y);
  this.svg.append("g")
      .attr("class", "xMain axis")
      .attr("transform", "translate(" + this.offsets.x1 + "," + this.offsets.y2Main + ")")
      .call(this.axes.xMain);
  this.svg.append("g")
      .attr("class", "xNav axis")
      .attr("transform", "translate(" + this.offsets.x1 + "," + this.offsets.y2Nav + ")")
      .call(this.axes.xNav);

  /* the brush is the shaded area in the nav window */
  this.brushed = function () {
    /* this block called when the brush is manipulated */
    const s = event.selection || this.scales.xNav.range();
    console.log("brushed", s.map(this.scales.xNav.invert, this.scales.xNav))
    this.xModified = this.scales.xMain.domain(s.map(this.scales.xNav.invert, this.scales.xNav));
    this.axes.xMain = this.axes.xMain.scale(this.scales.xMain);
    this.svg.select(".xMain.axis").call(this.axes.xMain);
    this.drawBars();
    if (this.brushHandle) {
      const sx = s.map(this.scales.xNav.invert);
      this.brushHandle
        .attr("display", null)
        .attr("transform", (d, i) => "translate(" + s[i] + "," + (this.offsets.heightNav + 29) + ")");
    }
  };

  this.brush = brushX()
    /* the extent is relative to the navGraph group - the constants are a bit hacky... */
    .extent([[this.offsets.x1, 0], [this.offsets.width + 20, this.offsets.heightNav - 1 + 30]])
    .on("brush end", () => this.brushed());
  this.gBrush = this.navGraph.append("g")
    .attr("class", "brush")
    .attr("stroke-width", 0)
    .call(this.brush)
    .call(this.brush.move, () => {
      return this.scales.xMain.range()
    });
  /* https://bl.ocks.org/mbostock/4349545 */
  this.brushHandle = this.gBrush.selectAll(".handle--custom")
    .data([{type: "w"}, {type: "e"}])
    .enter().append("path")
      .attr("class", "handle--custom")
      .attr("fill", darkGrey)
      .attr("cursor", "ew-resize")
      .attr("d", "M0,0 0,0 -7,15 7,15 0,0 Z")
      /* see the extent x,y params in brushX() (above) */
      .attr("transform", (d, i) =>
        d.type === "e" ?
        "translate(" + (this.offsets.x2 - 1) + "," + (this.offsets.heightNav + 29) + ")" :
        "translate(" + (this.offsets.x1 + 1) + "," + (this.offsets.heightNav + 29) + ")"
        )



  /* https://bl.ocks.org/mbostock/4015254 */
  this.svg.append("g")
    .append("clipPath")
      .attr("transform", "translate(" + this.offsets.x1 + "," + this.offsets.y1Main + ")")
      .attr("id", "clip")
    .append("rect")
      .attr("id", "cliprect")
      .attr("width", this.offsets.width)
      .attr("height", this.offsets.heightMain)


  /* draw the genes */
  this.drawGenes(this.data.annotations);
  /* draw the data */
  this.drawBars();

  this.zoomed = function () {
    const t = event.transform;
    /* rescale the x axis (not y) */
    this.xModified = t.rescaleX(this.scales.xMainOriginal);
    this.axes.xMain = this.axes.xMain.scale(this.scales.xMain);
    this.svg.select(".xMain.axis").call(this.axes.xMain);
    this.drawBars();

    /* move the brush */
    this.navGraph.select(".brush")
      .call(this.brush.move, () => {
        return this.scales.xMain.range().map(t.invertX, t)
      });

  };
};

export default EntropyChart;
