<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

/**
 * Name parts, and nothing that is a name.
 *
 * Three lists of common Pakistani given and family names, combined by
 * arithmetic. No entry here is a person: the lists are of parts, and which
 * parts meet is decided by Draw from a row index. That is the same guarantee
 * seed.ts gives in TypeScript, and the reason the demo data can live in a
 * public repository at all while the real register cannot.
 *
 * Given names are split by gender rather than pooled, which seed.ts did not do
 * — it assigned gender by index parity and produced records like "Ayesha Khan,
 * Male". At 112 rows that is a curiosity. At 2,000 it is the first thing a
 * demonstrator notices and the last thing they stop mentioning, so gender is
 * decided first here and the name follows from it.
 *
 * 44 x 44 of each gives about 1,900 distinct full names per gender, so a run of
 * 2,000 students repeats a handful. Real registers do too — two Ali Khans in an
 * intake is ordinary, and the registration number is what tells them apart,
 * which is exactly the thing the screens should be exercised against.
 */
final class Names
{
    public const MALE = [
        'Ali', 'Bilal', 'Hassan', 'Usman', 'Omar', 'Ahmed', 'Hamza', 'Yousuf',
        'Saad', 'Faisal', 'Danyal', 'Kamran', 'Zeeshan', 'Talha', 'Ibrahim',
        'Rehan', 'Shahzaib', 'Waleed', 'Arsalan', 'Junaid', 'Bilawal', 'Haris',
        'Mustafa', 'Zohaib', 'Adnan', 'Fahad', 'Salman', 'Imran', 'Nabeel',
        'Owais', 'Rizwan', 'Shahbaz', 'Taimoor', 'Umair', 'Wajahat', 'Yasir',
        'Zaid', 'Abdullah', 'Asad', 'Basit', 'Daniyal', 'Ehtisham', 'Furqan',
        'Ghulam Abbas',
    ];

    public const FEMALE = [
        'Ayesha', 'Zainab', 'Fatima', 'Hira', 'Sana', 'Maryam', 'Iqra', 'Nida',
        'Amna', 'Rabia', 'Sadia', 'Mahnoor', 'Anum', 'Kinza', 'Mehreen',
        'Areeba', 'Bushra', 'Dua', 'Eman', 'Faiza', 'Gulnaz', 'Hafsa', 'Isha',
        'Javeria', 'Komal', 'Laiba', 'Mishal', 'Noor', 'Palwasha', 'Qurat-ul-Ain',
        'Rimsha', 'Saba', 'Tehreem', 'Urooj', 'Warda', 'Yumna', 'Zoya',
        'Aleena', 'Bisma', 'Hooriya', 'Kiran', 'Minahil', 'Nimra', 'Sidra',
    ];

    /**
     * Family names, shared by every gender.
     *
     * Also the pool a father's name is drawn a surname from — except that the
     * father takes the student's own family name, so the two always agree. A
     * register where a third of the fathers have a different surname from their
     * children is the kind of detail that makes a demonstration stop being
     * about the software.
     */
    public const FAMILY = [
        'Khan', 'Ahmed', 'Malik', 'Chaudhry', 'Sheikh', 'Raza', 'Iqbal', 'Butt',
        'Qureshi', 'Bhatti', 'Siddiqui', 'Farooq', 'Nawaz', 'Aslam', 'Javed',
        'Ansari', 'Awan', 'Baig', 'Dar', 'Gilani', 'Hashmi', 'Jatoi', 'Kayani',
        'Lodhi', 'Mirza', 'Niazi', 'Rana', 'Sial', 'Tarar', 'Warraich', 'Zaidi',
        'Abbasi', 'Bajwa', 'Cheema', 'Durrani', 'Gondal', 'Hussain', 'Janjua',
        'Kamboh', 'Mughal', 'Rajput', 'Saeed', 'Toor', 'Virk',
    ];
}
