// Should have a singleton object Controller that does all the ranking and stuff

// TODO: Rankings are not exactly equal to CSRankings. Fix that later. Start investigating with the combined scores in areaToDepartment.

var Controller = function(cb){

    // ============================
    // ============================
    // Helper and public functions
    // ============================
    // ============================

    this.loadAuthorInfo = function(final_cb){
        var controller_obj = this;

        Papa.parse(this.authorinfoFile, {
            download: true,
            header: true,
            complete: function (results) {
                var data = results.data;
                controller_obj.authors = data;
                final_cb();
            }
        });
    }

    this.loadNonUSDepts = function(final_cb){
        var controller_obj = this;

        Papa.parse(this.nonUSFile, {
            download: true,
            header: true,
            complete: function(results){
                var data = results.data;
                for (var i=0; i<data.length; ++i){
                    controller_obj.nonUS.push(data[i].institution)
                }
                final_cb();
            }
        });
    }

    this.loadRegionInfo = function(final_cb){
        var controller_obj = this;

        Papa.parse("country-info-expanded.csv", {
            download: true,
            header: true,
            newline: '\n',
            complete: function(results){
                var data = results.data;
                for (var i=0; i<data.length; ++i){
                    // random boundary case bug
                    if (!(data[i].institution || data[i].region))
                        continue;
                    controller_obj.regionDict[data[i].institution.trim()] = data[i].region.trim();

                    // while you're at this, record the names of the institutions
                    if(data[i].region.trim() == 'usa')
                        controller_obj.schoolsUS.push(data[i].institution.trim());
                    else if(data[i].region.trim() == 'europe')
                        controller_obj.schoolsEurope.push(data[i].institution.trim());
                }
                controller_obj.schoolNames = Object.keys(controller_obj.regionDict);
                // add school names to typeahead
                $('#school-name').typeahead({
                    source: controller_obj.schoolsUS.concat(controller_obj.schoolsEurope),
                    fitToElement: true,
                    afterSelect: Controller.findSchool
                });
                final_cb();
            }
        });
    }

    this.loadFacultyInfo = function(final_cb){
        var controller_obj = this;
        Papa.parse('facultyinfo.csv', {
            download: true,
            header: true,
            newline: '\n',
            complete: function(results){
                var data = results.data;
                for(var i=0; i<data.length; ++i){
                    // add to lowdb
                    // console.log(data[i]);
                    controller_obj.faculty.push(data[i]);
                }
                final_cb();
            }
        });
    }

    this.combineScores = function(final_cb){
        var controller_obj = this;
        // NOTE: works with US and Europe only from 2000 onwards

        for(var i=0; i<controller_obj.authors.length; i++){
            var author = controller_obj.authors[i],
                name = author.name,
                dept = author.dept,
                area = author.area,
                count = parseInt(author.count),
                adjustedcount = parseFloat(author.adjustedcount),
                year = author.year;

            // removed && controller_obj.nonUS.indexOf(dept) == -1
            if(year>=2000 && (controller_obj.regionDict[dept] === 'usa' || controller_obj.regionDict[dept] === 'europe')){
                // count the score for the dept in the area
                if(!(area in controller_obj.areaToDepartment)){
                    controller_obj.areaToDepartment[area] = {};
                }
                if(!(dept in controller_obj.areaToDepartment[area])){
                    controller_obj.areaToDepartment[area][dept] = 0;
                }

                controller_obj.areaToDepartment[area][dept] += adjustedcount;
            }
            else continue;
        }

        // score in 'all' areas is geometric mean of area scores
        controller_obj.areaToDepartment['all'] = {};
        var total_areas = 23;
        var hits = {};
        for(var area in controller_obj.areaToDepartment){
            for(var dept in controller_obj.areaToDepartment[area]){
                // running geometric mean
                if(!(dept in controller_obj.areaToDepartment['all'])){
                    controller_obj.areaToDepartment['all'][dept] = 1;
                }
                controller_obj.areaToDepartment['all'][dept] *= Math.pow(controller_obj.areaToDepartment[area][dept], 1.0/total_areas);
            }
        }


        // TODO: could use a finer rank with some tolerance for ties
        // build a ranking of each area according to accumulated scores
        for(var area in controller_obj.areaToDepartment){
            var scoresDict = controller_obj.areaToDepartment[area];
            var sorted = Object.keys(scoresDict).sort(function(a, b){
                return scoresDict[b] - scoresDict[a];   // descending order
            });
            // save the ranking in the dictionary
            controller_obj.rankings[area] = sorted;
        }
        final_cb();
    }

    this.plotRankings = function(rankingsDict, avgRank){
        var divID = '#chart-container';
        var xAxisData = [], categoriesArr = [];

        // sort ranks so plot looks nice and smooth
        var sortedAreaNames = Object.keys(rankingsDict).sort(function(a, b){
            return rankingsDict[a] - rankingsDict[b];   // ascending order
        });

        // make data object for plotting
        for(var i=0; i < sortedAreaNames.length; i++){
            // don't show rank for all areas
            if(sortedAreaNames[i] == 'all')
                continue;
            xAxisData.push([this.cleanNames[sortedAreaNames[i]], rankingsDict[sortedAreaNames[i]]]);
            categoriesArr.push(this.cleanNames[sortedAreaNames[i]]);
        }

        $(divID).highcharts({
            title: {
                text: 'Rank Across Areas',
                x: -20 //center
            },
            subtitle: {
                text: '(Lower is better. Dashed line is median.)',
                x: -20
            },
            xAxis: {
                categories: categoriesArr
            },
            yAxis: {
                title: {
                    text: 'Rank'
                },
                plotLines: [{
                    value: avgRank,
                    width: 1,
                    color: '#39758F',
                    name: 'Average',
                    dashStyle: 'longdashdot'
                }]
            },
            tooltip: {
                valuePrefix: '#'
            },
            legend: {
                enabled: false
            },
            series: [{
                name: 'Rank',
                color: '#65D2FF',
                data: xAxisData
            }]
        });
    }

    this.showSchoolStats = function(statsDict, topAreas, bottomAreas, unconventional, allAreaRankings){
        var modeRank = statsDict['moderank'];

        // show all the above calculated stats
        jQuery('#search-results')[0].style.display = '';

        // if top rank has ties, show all sub-areas
        var topRank = topAreas[0][1];
        var str = "";
        for(var area in bottomAreas){
            str += this.cleanNames[bottomAreas[area][0]] + ' (' + bottomAreas[area][1] + ') '
        }
        jQuery('#weakest-areas')[0].innerHTML = str;

        var str = "";
        for(var area in topAreas){
            str += this.cleanNames[topAreas[area][0]] + ' (' + topAreas[area][1] + ') '
        }
        jQuery('#strongest-areas')[0].innerHTML = str;

        str = parseFloat(modeRank) + " ";
        if(statsDict['school_type'] == 'americas'){
            $('#computed-stats-heading').html("Out of " + String(Controller.schoolsUS.length) + " schools in the USA:");
        }
        else if(statsDict['school_type'] == 'europe'){
            $('#computed-stats-heading').html("Out of " + String(Controller.schoolsEurope.length) + " schools in Europe:");
        }
        jQuery('#mode-ranking')[0].innerHTML = str;
        jQuery('#first-quartile-ranking')[0].innerHTML = String(parseInt(statsDict['first_quartile']));
        jQuery('#median-ranking')[0].innerHTML = String(parseInt(statsDict['second_quartile']));
        jQuery('#third-quartile-ranking')[0].innerHTML = String(parseInt(statsDict['third_quartile']));

        if(Object.keys(unconventional).length > 0){
            // some schools might not have unconventional strengths, important to check

            // sort unconventional areas before displaying
            var unconventionalItems = Object.keys(unconventional).map(function(key){
                return [key, unconventional[key]];
            });
            var unconventionalItemsSorted = unconventionalItems.sort(function(first, second){
                return first[1] - second[1];    // ascending order
            })
            var str = "";
            for(var k=0; k < unconventionalItemsSorted.length; ++k){
                var area = unconventionalItemsSorted[k][0],
                    rank = unconventionalItemsSorted[k][1];
                str += this.cleanNames[area] + ' (' + rank + ') ';
            }
            jQuery('#unconventional-item')[0].style.display = '';
            jQuery('#unconventional-strength')[0].innerHTML = str;
        } else{
            jQuery('#unconventional-item')[0].style.display = 'none';
        }

        // show the plot. TODO: fix this
        // this.plotRankings(allAreaRankings, avgRank);
        this.plotRankings(allAreaRankings, statsDict['second_quartile']);
    }

    this.showFacultyList = function(areaToFaculty){
        var str = "<div class=\"panel-group\" id=\"faculty-panels\">"
        // areaToFaculty = apiData['apiResult'];
        for(area in areaToFaculty){
            // start panel
            str += "<div class=\"panel panel-default\">";

            // panel heading
            str += "<div class=\"panel-heading\" role=\"tab\" id=\"heading" + area + "\">";
            str += "<h5 class=\"panel-title\">";
            str += "<a role=\"button\" data-toggle=\"collapse\" href=\"#collapse" + area + "\">";
            str += Controller.cleanNames[area];
            str += "</a> </h5> </div>";

            // make faculty list in a collapsable panel
            str += "<div id=\"collapse" + area + "\" class=\"panel-collapse collapse panel-body\">";
            str += "<ul>";
            // iterate over all faculty
            for(var i=0; i<areaToFaculty[area].length; i++){
                str += "<li><a target=\"_blank\" href=\"" + areaToFaculty[area][i][1] + "\">" + areaToFaculty[area][i][0] + "</a></li>";
            }
            // end collapsable panel
            str += "</ul> </div>";

            // end panel
            str += "</div>";
        }

        // close the panel-group
        str += "</div>";

        // show the panel
        jQuery("#faculty-div-body")[0].innerHTML = str;
    }

    this.showAreawise = function(ranks, correlation){
        var str = "";
        for(rank in ranks){
            str += "<tr>" + "<td>" + rank + "</td>" + "<td>" + ranks[rank] + "</td>" + "</li>";
        }
        $('#area-ranking-list').html(str);

        $('#correlation-label').html("Correlation with all-area ranking: " + String(correlation.toFixed(3)));
        if(correlation >= .7){
            // disable all other styles and enable blue (label-info)
            $('#correlation-label').removeClass('label-danger');
            $('#correlation-label').removeClass('label-warning');
            $('#correlation-label').addClass('label-info');
        }
        else if(correlation >= .4 && correlation < .7){
            // disable all other styles and enable yellow (label-warning)
            $('#correlation-label').removeClass('label-info');
            $('#correlation-label').removeClass('label-danger');
            $('#correlation-label').addClass('label-warning');
        }
        else if(correlation < .4){
            // disable all other styles and enable red (label-danger)
            $('#correlation-label').removeClass('label-info');
            $('#correlation-label').removeClass('label-warning');
            $('#correlation-label').addClass('label-danger');
        }
    }

    this.facultyAreas = function(schoolName, cb){
        // new function: finds faculty areas and renders them through callback
        var controller_obj = this;
        var result = { "ai": [], "vision": [], "mlmining": [], "nlp": [], "ir": [], "arch": [], "comm": [], "sec": [],
        "mod": [], "hpc": [], "mobile": [], "metrics": [], "ops": [], "plan": [],
        "soft": [], "da": [], "act": [], "crypt": [], "log": [], "graph": [], "chi": [], "robotics": [], "bio": [] };

        var matches = _.filter(controller_obj.faculty, {school: schoolName});
        for(var i=0; i<matches.length; ++i){
            // some faculty members might not have areas listed; good idea to check
            if('areas' in matches[i] && matches[i]['areas']){
                // list faculty member under all of its areas
                var facultyMember = matches[i];
                var areas = JSON.parse(facultyMember['areas']);
                for(var j=0; j<areas.length; ++j){
                    result[areas[j]].push([facultyMember['name'], facultyMember['homepage']]);
                }
            }
        }
        // final results are in the results variable, render them
        cb(result);
    }

    this.findAreaRankForSchool = function(school, area, region, cb){
        // takes the school name, research sub-area and region to rank the school in calls cb with the rank
        // if it can't find the rank, calls cb with sentinel value 0
        // step 1. limit schools only to the given region
        var areaScores = Controller.areaToDepartment[area];
        var scoresDict = {};
        for(var dept in areaScores){
            if(Controller.regionDict[dept] == region)
                scoresDict[dept] = areaScores[dept];
        }

        // step 2: sort the universities
        // var scoresDict = Controller.areaToDepartment[area];
        var sorted = Object.keys(scoresDict).sort(function(a, b){
            return scoresDict[b] - scoresDict[a];   // descending order
        });
        // console.log('showing sorted', sorted);

        // step 3: find rank of the school passed as argument
        // get back here
        var schoolInAreaRank = sorted.indexOf(school) + 1;

        // sentinel value would be 0
        // cb(departmentRank);
        cb(schoolInAreaRank);
    }

    this.rankArea = function(area, region){
        var controller_obj = this;
        // find area and region acronyms for programmatic usage
        area = controller_obj.nameToAcronym[area];
        region = controller_obj.regionAcronymsDict[region];

        // find ranking (limit to top 100)
        var areaScores = controller_obj.areaToDepartment[area];
        // step 1: limit only to schools of the given region
        var areaDict = {};
        for(var dept in areaScores){
            if(controller_obj.regionDict[dept] == region)
                areaDict[dept] = areaScores[dept];
        }

        // step 2: sort the universities
        // create array from dictionary
        var dictItems = Object.keys(areaDict).map(function(key){
            return [key, areaDict[key]];
        });
        dictItems.sort(function(first, second){
            return second[1] - first[1];    // descending
        });

        // step 3: assign ranks (make school to score dictionary alongside for correlation)
        // no tie mechanism right now
        var rank = 1;
        var deptScore = {};
        var deptRanks = {};
        // console.log('>> debug 1', dictItems);
        // console.log('before>>', dictItems);
        for(var i=0; i<dictItems.length; ++i){
            deptRanks[rank] = dictItems[i][0];
            deptScore[dictItems[i][0]] = dictItems[i][1];
            rank += 1;
            if(rank > 100){
                // don't rank more than 100 schools for now
                break;
            }
        }
        // console.log('after>>', deptRanks);

        // var correlation = spearson.correlation.spearman([17.88, 13.54, 2.35], [1.67, 12.34, 0.15]);
        // not using Object.values because not supported in Safari
        var current_area_scores = Object.keys(deptScore).map(function(dept){
            return deptScore[dept];
        });
        // var current_area_scores = Object.values(deptScore);
        var all_area_scores = [];
        for(var dept in deptScore){
            all_area_scores.push(controller_obj.areaToDepartment['all'][dept]);
        }
        var corr = spearson.correlation.spearman(current_area_scores, all_area_scores);

        // render the ranking to the #area-ranking-list
        controller_obj.showAreawise(deptRanks, corr);
    }

    // for a particular school, finds the best ranking and shows it on the page
    this.findSchool = function(){
        var schoolName = jQuery('#school-name')[0].value,
            controller_obj = this,
            allAreaRankings = {},
            computedStats = schoolstats[schoolName];
        // var schoolName = "Carnegie Mellon University";
        // console.log('in findSchool>>', schoolName);
        // findAreaRankForSchool = function(school, area, region, cb){
        // controller_obj.findAreaRankForSchool(schoolName, 'ai', 'europe', controller_obj.echo);

        // find ranks of current school in all areas
        // for(area in controller_obj.rankings){
        //     var areaRanking = controller_obj.rankings[area];
        //     var schoolInAreaRank = areaRanking.indexOf(schoolName) + 1
        //     if(schoolInAreaRank)
        //         allAreaRankings[area] = schoolInAreaRank;
        // }

        // find which region to rank school against
        var regionToRankAgainst = "";
        if (computedStats['school_type'] == 'americas'){
            regionToRankAgainst = 'usa'
        }
        else if(computedStats['school_type'] == 'europe'){
            regionToRankAgainst = 'europe'
        }

        for(var area in Controller.cleanNames){
            // find the rank for the shcool in every area
            Controller.findAreaRankForSchool(schoolName, area, regionToRankAgainst, function(rank){
                if(rank > 0){
                    allAreaRankings[area] = rank;
                }
            });
        }

        // reduce results to top 3 areas
        var sortable = [];
        var allRanks = [];
        for(var area in allAreaRankings){
            sortable.push([area, allAreaRankings[area]]);
            allRanks.push(allAreaRankings[area]);
        }
        sortable.sort(function(a, b){
            return a[1] - b[1];
        });
        var topAreas = sortable.slice(0, 3);
        var bottomAreas = sortable.slice(sortable.length-3, sortable.length);


        // unconventional ratings = 1.5 standard deviations away from the average
        var medianRank = computedStats['second_quartile'];
        var unconventional = {};
        var std = math.std(allRanks);
        for(area in allAreaRankings){
            if(medianRank - allAreaRankings[area] > 1.5*std){
                unconventional[area] = allAreaRankings[area];
            }
        }

        Controller.showSchoolStats(computedStats, topAreas, bottomAreas, unconventional, allAreaRankings);
        // $.get({
        //     url: this.url + "/schoolwise/stats",
        //     data: {'schoolName': schoolName},
        //     dataType: 'json',
        //     success: function(data){
        //         // show all stats after getting results from api
        //         Controller.showSchoolStats(data, topAreas, unconventional, allAreaRankings);
        //     }
        // });

        // get area-wise faculty listing from api
        Controller.facultyAreas(schoolName, Controller.showFacultyList);
        // $.get({
        //     url: this.url + "/schoolwise/faculty",
        //     data: {'schoolName': schoolName},
        //     dataType: 'json',
        //     success: function(data){
        //         // show faculty list after retrieving from api
        //         console.log('success with faculty', data);
        //         Controller.showFacultyList(data);
        //     }
        // });
    }

    this.echo = function(){
        console.log('hello world');
    }

    // runs all initialization steps in sequence. returns a promise
    this.init = function(){
        var controller_obj = this;
        var deferred = Q.defer();
        controller_obj.loadAuthorInfo(
            function(){
                controller_obj.loadFacultyInfo(
                    function(){
                        controller_obj.loadNonUSDepts(
                            function(){
                                controller_obj.loadRegionInfo(
                                    function(){
                                        controller_obj.combineScores(
                                            function(){
                                                deferred.resolve();
                                        });
                                });
                        });
                });
        });
        return deferred.promise;
    }

    // ============================
    // ============================
    // The construction process
    // ============================
    // ============================

    this.areaMap =
        [{ area: "ai", title: "AI" },
        { area: "vision", title: "Vision" },
        { area: "mlmining", title: "ML" },
        { area: "nlp", title: "NLP" },
        { area: "ir", title: "Web & IR" },
        { area: "arch", title: "Arch" },
        { area: "comm", title: "Networks" },
        { area: "sec", title: "Security" },
        { area: "mod", title: "DB" },
        { area: "hpc", title: "HPC" },
        { area: "mobile", title: "Mobile" },
        { area: "metrics", title: "Metrics" },
        { area: "ops", title: "OS" },
        { area: "plan", title: "PL" },
        { area: "soft", title: "SE" },
        { area: "act", title: "Theory" },
        { area: "crypt", title: "Crypto" },
        { area: "log", title: "Logic" },
        { area: "graph", title: "Graphics" },
        { area: "chi", title: "HCI" },
        { area: "robotics", title: "Robotics" },
        { area: "bio", title: "Comp. Biology" },
        { area: "da", title: "Design Automation" }];
    this.cleanNames = {
        'ai': 'Artificial Intelligence',
        'vision': 'Computer Vision',
        'mlmining': 'Machine Learning',
        'nlp': 'Natural Language Processing',
        'ir': 'Information Retrieval & Web',
        'arch': 'Architecture',
        'comm': 'Networks',
        'sec': 'Security',
        'mod': 'Databases',
        'hpc': 'High Performance Computing',
        'mobile': 'Mobile Computing',
        'metrics': 'Metrics',
        'ops': 'Operating Systems',
        'plan': 'Programming Languages',
        'soft': 'Software Engineering',
        'act': 'Theory',
        'crypt': 'Cryptography',
        'log': 'Logic & Verification',
        'graph': 'Graphics',
        'chi': 'Human Computer Interaction',
        'robotics': 'Robotics',
        'bio': 'Comp. Biology',
        'da': 'Design Automation',
        'all': 'All Areas'
    }
    this.nameToAcronym = {
        'Artificial Intelligence': 'ai',
        'Computer Vision': 'vision',
        'Machine Learning': 'mlmining',
        'Natural Language Processing': 'nlp',
        'Information Retrieval & Web': 'ir',
        'Architecture': 'arch',
        'Networks': 'comm',
        'Security': 'sec',
        'Databases': 'mod',
        'High Performance Computing': 'hpc',
        'Mobile Computing': 'mobile',
        'Metrics': 'metrics',
        'Operating Systems': 'ops',
        'Programming Languages': 'plan',
        'Software Engineering': 'soft',
        'Theory': 'act',
        'Cryptography': 'crypt',
        'Logic & Verification': 'log',
        'Graphics': 'graph',
        'Human Computer Interaction': 'chi',
        'Robotics': 'robotics',
        'Comp. Biology': 'bio',
        'Design Automation': 'da',
        'All Areas': 'all'
    }
    this.regionAcronymsDict = {
        'United States': 'usa',
        'Europe': 'europe'
    }
    this.aiAreas = ["ai", "vision", "mlmining", "nlp", "ir"];
    this.systemsAreas = ["arch", "comm", "sec", "mod", "hpc", "mobile", "metrics", "ops", "plan", "soft", "da"];
    this.theoryAreas = ["act", "crypt", "log"];
    this.otherAreas = ["graph", "chi", "robotics", "bio"];
    this.authors = [];
    this.nonUS = [];    // names of schools outside US
    this.schoolsUS = [];
    this.schoolsEurope = [];
    this.schoolNames = [];
    this.areaToDepartment = {};
    this.rankings = {};
    this.regionDict = {};
    this.faculty = [];
    this.regionFile = "country-info-expanded.csv"
    this.authorinfoFile = "generated-author-info.csv";
    this.nonUSFile = "country-info.csv";
    this.url = "http://localhost:3000";
}

function init_singleton(){
    console.log(">>> Initializing Controller state...");
    window.Controller = new Controller();
    Controller.init().done(function(){
        console.log(">>> Initialization successful...");
    });
}

window.onload = init_singleton;
