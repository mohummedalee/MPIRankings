# Script to make a bigger country-info file that has the US as well
# Need this for many things among Typeahead
import csv

if __name__ == '__main__':
    regionDict = {}

    # identify all school names
    scores_file = '../faculty-affiliations.csv'
    with open(scores_file, 'r') as fh:
        reader = csv.reader(fh)
        next(reader, None)  # skip header

        for line in reader:
            name = line[0].strip()
            school = line[1].strip()

            # Initialize blank for all
            regionDict[school] = None

    # tag all school names with regions
    countryinfo_file = '../country-info.csv'
    with open(countryinfo_file, 'r') as fh:
        reader = csv.reader(fh)
        next(reader, None)  # skip header

        for line in reader:
            institution = line[0].strip()
            region = line[1].strip()
            regionDict[institution] = region

    # for all that remain untagged, they're USA
    for institution in regionDict:
        if regionDict[institution] is None:
            regionDict[institution] = 'usa'


    # write back all to file
    out_file = '../country-info-expanded.csv'
    with open(out_file, 'w') as wh:
        writer = csv.writer(wh)

        # write header
        writer.writerow(['institution','region'])

        # write all departments and corresponding regions to file
        for institution in regionDict:
            writer.writerow([institution, regionDict[institution]])
