# NOTE: This script runs for a long time so it's not advisable to run on your personal computer

# computes a bunch of stats for each school and saves them to schoolstats.json
import sys
sys.path.append('BitVector-3.4.4')
from numpy import average
from collections import Counter
from BitVector import BitVector
import numpy as np
import csv
import json
import random
import operator

# ================
# helper functions
# ================
def rank(weight_string, regions, area_to_department):
    global region_dict
    # returns ranking of all schools in `regions` regions and areas specified by `weight_string`
    arealist = area_to_department.keys()

    # convert weight_string to a list of area names
    areas_to_rank = []
    for i, bit in enumerate(weight_string):
        if int(bit):
            areas_to_rank.append(arealist[i])

    # calculate geometric mean score for each school
    scores = {} # school to score
    n_inv = 1./len(areas_to_rank)

    for area in areas_to_rank:
        for school in area_to_department[area]:
            if not region_dict[school] in regions:
                continue
            if school not in scores:
                scores[school] = area_to_department[area][school] ** n_inv
            else:
                scores[school] *= area_to_department[area][school] ** n_inv

    # return the rank of the school in the argument
    ranking = sorted(scores.items(), key=operator.itemgetter(1), reverse=True)
    school_ranking = [tup[0] for tup in ranking]
    school_scores = [tup[1] for tup in ranking]
    return school_ranking, school_scores

# =========================
# global script parameterts
# =========================
country_filepath = '../country-info-expanded.csv'
facultyscores_filepath = '../generated-author-info.csv'
start_year = 2000
end_year = 2016

# =====================
# load all school names
# =====================
region_dict = {}
with open(country_filepath, 'r') as fh:
    reader = csv.reader(fh)
    next(reader, None)  # skip header
    for line in reader:
        region_dict[line[0]] = line[1]

school_list = region_dict.keys()
north_america = [school for school in school_list if region_dict[school] == 'usa' or region_dict[school] == 'canada']
europe = [school for school in school_list if region_dict[school] == 'europe']
schoolcount_americas = len(north_america)
schoolcount_europe = len(europe)

# ============================
# load school publication data
# ============================
area_to_department = {}
with open(facultyscores_filepath, 'r') as fh:
    reader = csv.reader(fh)
    next(reader, None)  # skip header
    for line in reader:
        faculty = line[0]
        school = line[1]
        area = line[2]
        score = int(float(line[3]))
        adjusted_score = float(line[4])
        year = int(line[5])

        if year < start_year or year > end_year:
            continue
        if area in area_to_department:
            if school in area_to_department[area]:
                area_to_department[area][school] += adjusted_score
            else:
                area_to_department[area][school] = adjusted_score
        else:
            area_to_department[area] = {school: adjusted_score}

# ==========================================================================
# compute stats for north american and european schools in their own regions
# ==========================================================================

# NOTE: OHSU was removed from the ranking. it had very little data
school_list.remove('OHSU')

allschools_stats = {}
for school in school_list:
    print school
    schoolstats = {}
    school_type = None  # variable that indicates what region school is from
    region_arr = [] # array that holds all areas to rank amongst

    # final_integer = int(BitVector(bitstring = "1"*23))
    final_integer = 50

    if region_dict[school] in ['usa', 'canada']:
        school_type = 'americas'
        region_arr = ['usa', 'canada']
    elif region_dict[school] == 'europe':
        school_type = 'europe'
        region_arr = ['europe']
    else:
        # only dealing with north american and european schools right now
        continue

    # maintain all ranks for the current school
    allranks = {}
    # random_area_combs = random.sample(xrange(1, final_integer+1), 100)
    weight_integer = 1
    while(weight_integer <= final_integer):
        # convert area combination into a bitstring
        weight_string = str(BitVector(intVal=weight_integer, size=23))
        # print weight_string

        area_ranking, area_scores = rank(weight_string, region_arr, area_to_department)
        current_rank = area_ranking.index(school) if school in area_ranking else None
        if current_rank:
            allranks[weight_string] = current_rank

        # increment weight string
        weight_integer += 1
        try:
            weight_string = str(BitVector(intVal=weight_integer, size=23))
        except:
            # integer can no longer be 23 bits
            break

    if not allranks:
        # school has no rankings
        continue

    freqs = Counter(allranks.values())
    schoolstats['moderank'] = freqs.most_common(1)[0][0]

    schoolstats['first_quartile'] = np.percentile(allranks.values(), 25)   # 25th percentile
    schoolstats['second_quartile'] = np.percentile(allranks.values(), 50)  # median (50th percentile)
    schoolstats['third_quartile'] = np.percentile(allranks.values(), 75)   # 75th percentile
    schoolstats['school_type'] = school_type

    allschools_stats[school] = schoolstats

# dump all school stats to a json file
with open('schoolstats.json', 'w') as wh:
    json.dump(allschools_stats, wh)
