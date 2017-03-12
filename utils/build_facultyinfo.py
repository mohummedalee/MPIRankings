# Helper script to build facultyinfo.csv - a file that contains combined information for faculty members
# e.g. name, homepage, areas published in in past 5 years (for faculty listing)
import csv
import time
from pprint import pprint
import codecs
import json

if __name__ == '__main__':
    ignored_areas = ['bed', 'vis']
    facultyDict = {}    # all faculty data goes here

    # ==========================
    # STEP 1. Find affiliations
    # ==========================
    affiliations_file = '../faculty-affiliations.csv'

    with open(affiliations_file, 'r') as fh:
        reader = csv.reader(fh)
        next(reader, None)  # skip header

        for line in reader:
            name = line[0].strip()
            affiliation = line[1].strip()

            facultyDict[name] = {'school': affiliation}

    # ==========================
    # STEP 2. Load homepages
    # ==========================
    homepages_file = '../homepages.csv'

    with open(homepages_file, 'r') as fh:
        reader = csv.reader(fh)
        next(reader, None)  # skip header

        for line in reader:
            name = line[0].strip()
            homepage = line[1].strip()

            if name in facultyDict:
                facultyDict[name]['homepage'] = homepage

    # ==========================
    # STEP 3. Identify research areas of past 5 years for each author
    # ==========================
    ranking_score_file_berger = '../generated-author-info.csv'

    with open(ranking_score_file_berger, 'r') as fh:
        reader = csv.reader(fh)
        next(reader, None)  # skip header

        end_year = time.strftime('%Y')
        start_year = int(end_year) - 5   # only record areas author has published in last 5 years
        for line in reader:
            name = line[0].strip()
            dept = line[1].strip()
            area = line[2].strip()
            year = int(line[5].strip())

            if year < start_year or area in ignored_areas:
                continue

            if name in facultyDict:
                if 'areas' in facultyDict[name]:
                    facultyDict[name]['areas'].add(area)
                else:
                    facultyDict[name]['areas'] =  set([area])

    # ==========================
    # STEP 4. Write all info to file
    # ==========================
    facultyinfo_file = '../facultyinfo.csv'

    with open(facultyinfo_file, 'w') as wh:
        writer = csv.writer(wh)

        # write header
        writer.writerow(['school','homepage','name','areas'])
        for name in facultyDict:
            school =  facultyDict[name]['school']
            homepage =  facultyDict[name]['homepage'] if 'homepage' in facultyDict[name] else 'null'
            areas =  json.dumps(list(facultyDict[name]['areas']), separators=(',',': ')) if 'areas' in facultyDict[name] else None

            # write to file
            writer.writerow([school, homepage ,name, areas])
