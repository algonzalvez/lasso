/**
 * Copyright 2021 Alejandro Gomez
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 **/

'use strict';

const psi = require('psi');
const {BigQuery} = require('@google-cloud/bigquery');

/**
 * PageSpeedInsights Audit
 */
class PageSpeedInsightsAudit {
  /**
   * Constructor
   * @param {Array} urls
   * @param {string} mode
   * @param {Object} auditFieldMapping
   */
  constructor(urls, mode, auditFieldMapping) {
    this.urls = urls;
    this.mode = mode;
    this.auditResults = [];
    this.auditFieldMapping = auditFieldMapping;
    this.performanceScore = [];

  }

  /**
   * PageSpeed audits to run sequentially
   * @return {Array}
   */
  async run() {
    for (let i = 0; i < this.urls.length; i++) {
      const url = this.urls[i];

      try {
        const results = await this.performAudit(url, this.mode);
        this.performanceScore.push(results.performance);
        this.auditResults.push(results.metrics);
      } catch (e) {
        throw new Error(`${e.message} on ${url}`);
      }
    }

    return this.auditResults;
  }

  /**
   * Runs a page speed insights performance audit
   * @param {string} url
   * @param {string} mode
   * @return {Promise}
   */
  async performAudit(url, mode) {

    const strategy = mode == 'desktop' ? mode : 'mobile';
    let options = {
        strategy: strategy
    };
    if (process.env.GOOGLE_INSIGHTS_KEY) {
      options['key'] = process.env.GOOGLE_INSIGHTS_KEY;
    } else {
      options['nokey'] = 'true';
    }

    // Supply options to PSI and get back speed
    return await psi(url, options).then((metrics) => {

        const audits = metrics.data.lighthouseResult.audits;
        // adding the performance score
        const performance = metrics.data.lighthouseResult.categories.performance.score;
        if (typeof(audits) != 'undefined' && audits != null) {
            audits['url'] = url;
            return { metrics: audits, performance: performance};
        }
    }).catch((e) => {
        throw new Error(`PSI Audit error: ${e.message}`);
    });

  }

  /**
   * Returns the instance's audit results, properly formatted for
   * inserting into BigQuery. Columns selected are based on the
   * auditFileMapping configuration supplied in the constructor.
   * @return {Array}
   */
  getBQFormatResults() {
    const today = new Date();
    const date = today.toJSON().slice(0, 10);
    const time = today.toJSON().slice(11,23);
    let it = 0;
    return this.auditResults.map((audit) => {
      if (typeof (audit) != 'undefined') {
        const formattedAudit = Object.entries(this.auditFieldMapping).
            reduce((res, keyVal) => {
              res[keyVal[0]] = audit[keyVal[1]] ? audit[keyVal[1]].numericValue : 0;
              res[keyVal[0] + '_score'] = audit[keyVal[1]] ? audit[keyVal[1]].score : 0;
              return res;
            }, {});

        formattedAudit['performanceScore'] = this.performanceScore[it];
        formattedAudit['date'] = BigQuery.date(date);
        formattedAudit['datetime'] = BigQuery.datetime(today.toISOString());
        formattedAudit['time'] = BigQuery.time(time);
        formattedAudit['url'] = audit.url;
        it ++;
        return formattedAudit;
      }
    });
  }

  /**
   * @return {Array}
   */
  getRawResults() {
    return this.auditResults;
  }
}

module.exports = {
  PageSpeedInsightsAudit,
};
