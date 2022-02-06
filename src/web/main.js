/* 
This file is part of the Review Heatmap add-on for Anki

Custom Heatmap JS

Copyright: (c) 2016-2022 Glutanimate <https://glutanimate.com/>
License: GNU AGPLv3 <https://www.gnu.org/licenses/agpl.html>
*/

import "./_vendor/cal-heatmap.css";
import "./css/review-heatmap.css";

import { CalHeatMap } from "./_vendor/cal-heatmap.js"

// Button click handlers
// ##########################################################################

export function onHmSelChange(selector) {
  selector.blur();
  var val = selector.value;
  // console.log(val);
}

export function onHmNavigate(event, button, direction) {
  if (direction === "next") {
    if (event.shiftKey) {
      cal.jumpTo(cal.options.maxDate); // shift-click to jump to limit
    } else {
      cal.next(cal.options.range);
    }
  } else {
    if (event.shiftKey) {
      cal.jumpTo(cal.options.minDate); // shift-click to jump to limit
    } else {
      cal.previous(cal.options.range);
    }
  }
}

export function onHmHome(event, button) {
  if (event.shiftKey) {
    pycmd("revhm_modeswitch");
  } else {
    cal.rewind();
  }
}

export function onHmOpts(event, button) {
  if (event.shiftKey) {
    pycmd("revhm_themeswitch");
  } else {
    pycmd("revhm_opts");
  }
}

export function onHmContrib(event, button) {
  if (event.shiftKey) {
    pycmd("revhm_snanki");
  } else {
    pycmd("revhm_contrib");
  }
}

// Date mangling
// ##########################################################################

// return "zero"-ed local datetime (workaround for lack of UTC time support
// in cal-heatmap)
export function applyDateOffset(date) {
  return new Date(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
}

// return local timezone offset in seconds at given unix timestamp
export function tzOffsetByTimestamp(timestamp) {
  date = new Date(timestamp * 1000);
  return date.getTimezoneOffset() * 60;
}

// Heatmap
// ##########################################################################

export function initHeatmap(options, data) {
  var calStartDate = applyDateOffset(new Date());
  var calMinDate = applyDateOffset(new Date(options.start));
  var calMaxDate = applyDateOffset(new Date(options.stop));
  var calTodayDate = applyDateOffset(new Date(options.today));

  // Running overview of 6-month activity in month view:
  if (options.domain === "month") {
    padding = options.range / 2;
    // TODO: fix
    paddingLower = Math.round(padding - 1);
    paddingUpper = Math.round(padding + 1);

    calStartDate.setMonth(calStartDate.getMonth() - paddingLower);
    calStartDate.setDate(1);

    // Start at first data point if history < 6 months
    if (calMinDate.getTime() > calStartDate.getTime()) {
      calStartDate = calMinDate;
    }

    tempDate = new Date(calTodayDate);
    tempDate.setMonth(tempDate.getMonth() + paddingUpper);
    tempDate.setDate(1);

    // Always go back to centered view after scrolling back then forward
    if (tempDate.getTime() > calMaxDate.getTime()) {
      calMaxDate = tempDate;
    }
  }

  var cal = new CalHeatMap();

  // console.log("Date: options.today " + new Date(options.today))
  // console.log("Date: calTodayDate "+ calTodayDate)
  // console.log("Date: Date() "+ new Date())

  cal.init({
    domain: options.domain,
    subDomain: options.subdomain,
    range: options.range,
    minDate: calMinDate,
    maxDate: calMaxDate,
    cellSize: 10,
    verticalOrientation: false,
    dayLabel: true,
    domainMargin: [1, 1, 1, 1],
    itemName: ["card", "cards"],
    highlight: calTodayDate,
    today: calTodayDate,
    start: calStartDate,
    legend: options.legend,
    displayLegend: false,
    domainLabelFormat: options.domLabForm,
    tooltip: true,
    subDomainTitleFormat: function (isEmpty, fmt, rawData) {
      // format tooltips
      var timeNow = Date.now();
      if (isEmpty) {
        if (timeNow < rawData.t) {
          label = "cards due";
        } else {
          label = "reviews";
        }
        tip = "<b>No</b> " + label + " on " + fmt.date;
      } else {
        if (rawData.v < 0) {
          count = -1 * fmt.count;
          action = "due";
        } else {
          count = fmt.count;
          action = "reviewed";
        }
        label = Math.abs(rawData.v) == 1 ? "card" : "cards";
        tip =
          "<b>" +
          count +
          "</b> " +
          label +
          " <b>" +
          action +
          "</b> " +
          fmt.connector +
          " " +
          fmt.date;
      }

      return tip;
    },
    onClick: function (date, nb) {
      // Click handler that shows cards assigned to a particular date
      // in Anki's card browser

      if (nb === null || nb == 0) {
        // No cards for that day. Preserve highlight and return.
        cal.highlight(calTodayDate);
        return;
      }

      // console.log(date)

      // Determine if review history or forecasts
      isHistory = nb >= 0;

      // Apply deck limits
      cmd = options.whole ? "" : "deck:current ";

      today = new Date(calTodayDate);
      today.setHours(0, 0, 0); // just a precaution against
      // calTodayDate not being zeroed
      diffSecs = Math.abs(today.getTime() - date.getTime()) / 1000;
      diffDays = Math.round(diffSecs / 86400);

      // Construct search command
      if (nb >= 0) {
        // Review log
        if (!window.rhNewFinderAPI) {
          // Use custom finder based on revlog ID range
          cutoff1 = date.getTime() + options.offset * 3600 * 1000;
          cutoff2 = cutoff1 + 86400 * 1000;
          cmd += "rid:" + cutoff1 + ":" + cutoff2;
        } else {
          console.log("new finder");
          cmd += "prop:rated=" + (diffDays ? -diffDays : 0);
        }
      } else {
        // Forecast
        cmd += "prop:due=" + diffDays;
      }

      // Invoke browser
      pycmd("revhm_browse:" + cmd);

      // Update date highlight to include clicked on date AND today
      cal.highlight([calTodayDate, date]);
    },
    afterLoadData: function afterLoadData(timestamps) {
      // Cal-heatmap always uses the local timezone, which is problematic
      // when supplying UTC start-of-day times.
      //
      // This workaround updates the supplied timestamps to force
      // cal-heatmap to display times in UTC. E.g.:
      //   - input datetime (UTC): 2018-01-02 00:00:00 UTC+0000 (UTC)
      //   - cal-heatmap datetime: 2018-01-01 20:00:00 UTC-0400 (EDT)
      //   - workaround datetime:  2018-01-02 00:00:00 UTC-0400 (EDT)
      //
      // Please note that this change will skew any programmatic data
      // output from cal-heatmap, e.g. when implementing an onClick
      // handler. You will have to take the updated datetime into
      // account in that case.
      //
      // cf.: https://github.com/wa0x6e/cal-heatmap/issues/122
      //      https://github.com/wa0x6e/cal-heatmap/issues/126
      var results = {};
      for (var timestamp in timestamps) {
        var value = timestamps[timestamp];
        timestamp = parseInt(timestamp, 10);
        results[timestamp + tzOffsetByTimestamp(timestamp)] = value;
      }
      return results;
    },
    data: data,
  });

  return cal;
}

window.initHeatmap = initHeatmap;
