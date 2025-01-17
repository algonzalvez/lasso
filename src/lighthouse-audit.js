/**
 * Copyright 2020 Google LLC
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

const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const {BigQuery} = require('@google-cloud/bigquery');

/**
 * Lighthouse Audit
 */
class LighthouseAudit {
  /**
   * Constructor
   * @param {Array} urls
   * @param {Array} blockedRequestPatterns
   * @param {Object} auditConfig
   * @param {Object} auditFieldMapping
   */
  constructor(urls, blockedRequestPatterns = [], auditConfig, auditFieldMapping) {
    this.urls = urls;
    this.blockedRequestPatterns = blockedRequestPatterns;
    this.auditConfig = auditConfig;
    this.auditResults = [];
    this.auditFieldMapping = auditFieldMapping;
    this.performanceScore = [];
  }

  /**
   * Initializes a new puppeteer instance and triggers a set of
   * LH audits to run sequentially
   * @return {Array}
   */
  async run() {
    // https://www.onooks.com/how-to-remove-ssl-certificate-check-error-with-puppeteer-in-headless-mode/
    const browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      acceptInsecureCerts: true
      headless: true,
      args: ['--no-sandbox','--proxy-bypass-list=*', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-first-run', '--no-sandbox', '--no-zygote', '--single-process', '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--enable-features=NetworkService']
    });

    for (let i = 0; i < this.urls.length; i++) {
      const url = this.urls[i];

      try {
        const page = await browser.newPage();
        const results = await this.performAudit(url, page, this.blockedRequestPatterns);
        this.performanceScore.push(results.performance);
        this.auditResults.push(results.metrics);
      } catch (e) {
        throw new Error(`${e.message} on ${url}`);
      }
    }

    return this.auditResults;
  }

  /**
   * Runs a lighthouse performance audit on specific page in a chrome instance
   * @param {string} url
   * @param {Object} page
   * @param {Array} blockedUrlPatterns
   * @return {Promise}
   */
  async performAudit(url, page, blockedUrlPatterns) {
    const port = page.browser().wsEndpoint().split(':')[2].split('/')[0];
    const options = {
      blockedUrlPatterns,
      port,
    };

    return await lighthouse(url, options, this.auditConfig)
        .then((metrics) => {
          const audits = metrics.lhr.audits;
          // adding the performance score
          const performance = metrics.lhr.categories.performance.score;

          if (typeof(audits) != 'undefined' && audits != null) {
            audits['url'] = url;
            return { metrics: audits, performance: performance};
          }
        }).catch((e) => {
          throw new Error(`LH Audit error: ${e.message}`);
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
        formattedAudit['blockedRequests'] = this.blockedRequestPatterns.join(',');
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
  LighthouseAudit,
};
