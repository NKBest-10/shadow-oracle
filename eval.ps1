$list = @"
Nat|https://nazt.github.io/portfolio-v2/
Jonat|https://piyanat012.github.io/portfolio-v2/
golf|https://achernar046.github.io/portfolio/
Chitnarong|https://tomberman.github.io/cv-v2/
Best|https://nkbest-10.github.io/bie-cv-v2/
Little|https://little082003.github.io/cv-v2-portfolio/
jang|https://hijj23.github.io/my-projectcv/
kritsada|https://tachibana777.github.io/cv-v2/
chompoo|https://chomwarit26-cell.github.io/madaew-cv-v2/
Yok|https://peerada67.github.io/cv-portfolio-v2/
Keep|https://kanyanat47.github.io/lisa-cv/
Basss|https://bass435.github.io/portfolio-v2/
kew|https://chilrawut20042016-alt.github.io/nara-cv-v2/
Smile|https://sirilux014.github.io/v2-portfolio/
Wanarat|https://wanaratj.github.io/cv-v2/
Bell|https://piyatida67.github.io/cv-v2/
somkiat|https://pleumsomkiat.github.io/Portfolio/
Akarapon|https://akarapon175.github.io/messi-cv-v2/
chatphisit|https://chatphisit.github.io/portfolio-v2/
Ratchanon|https://ratchanon00.github.io/ratchanon-cv/
phanusorn|https://phanusorn049.github.io/9arm-cv-v2/
aumeiei|https://patchara1909.github.io/cv-v2/
Ray|https://rrrmar.github.io/pinkerton-portfolio/
Toey|https://tkronwipar.github.io/konwipa-cv/
To|https://tonbun.github.io/portfolio-thammanat-v2/
Tour|https://tour4645.github.io/matheus-cunha-cv-v2/
Ford|https://fordzaza998.github.io/thanathorn-cv-simple/
Teh|https://chonlasit6715247005.github.io/pita-cv-v2/
bank|https://tunwak.github.io/galileo-cv-v2/
Peg|https://spektrumbk.github.io/nattawut-cv/
baifern|https://natcharika24.github.io/cv-natcharika/
Baitong|https://nadticha30.github.io/cv-version2/
louis|https://tanmakoto.github.io/louis-iii-portfolio/
Fluke|https://7sx6ll.github.io/cv-v2/
Q|https://lkk19131-cloud.github.io/ratthaphum-cv-v2/
yok2|https://soysajee47.github.io/cv-v2-wat-phra-sri/
heman|https://heman1033p-create.github.io/cv-v2-kongphop/
Klang|https://noppadonsee-art.github.io/test-gemini/
Som|https://sasikansomoo-source.github.io/perth-cv-v2/
"@

$results = @()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

foreach ($line in $list -split "`n") {
    $parts = $line.Split("|")
    if ($parts.Length -lt 2) { continue }
    $name = $parts[0].Trim()
    $url = $parts[1].Trim()
    
    if (-not $url.StartsWith("http")) { continue }
    
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $html = $response.Content
        
        $score = 0
        $details = @()
        
        if ($html -match 'flex|grid') { $score += 10; $details += "Layout(10)" }
        if ($html -match 'transition|transform|animation|@keyframes') { $score += 15; $details += "Motion(15)" }
        if ($html -match 'box-shadow|drop-shadow') { $score += 5; $details += "Depth(5)" }
        if ($html -match 'gradient') { $score += 5; $details += "ColorGen(5)" }
        if ($html -match '@media') { $score += 10; $details += "Responsive(10)" }
        if ($html -match 'font-family|@import') { $score += 5; $details += "Typography(5)" }
        if ($html -match 'hover') { $score += 5; $details += "Interact(5)" }
        if ($html -match 'border-radius') { $score += 5; $details += "Shapes(5)" }
        
        $cssScore = 0
        $cssLinks = [regex]::Matches($html, '<link[^>]+href="([^"]+\.css)"')
        foreach ($match in $cssLinks) {
            $cssUrl = $match.Groups[1].Value
            if (-not $cssUrl.StartsWith("http")) {
                # basic relative path resolution
                $cssUrl = $url.TrimEnd('/') + '/' + $cssUrl.TrimStart('./')
            }
            try {
                $cssRes = Invoke-WebRequest -Uri $cssUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                $css = $cssRes.Content
                if ($css -match 'flex|grid') { $cssScore += 10; $details += "CSS_Layout(10)" }
                if ($css -match 'transition|transform|animation|@keyframes') { $cssScore += 15; $details += "CSS_Motion(15)" }
                if ($css -match 'box-shadow|drop-shadow') { $cssScore += 5; $details += "CSS_Depth(5)" }
                if ($css -match 'gradient') { $cssScore += 5; $details += "CSS_ColorGen(5)" }
                if ($css -match '@media') { $cssScore += 10; $details += "CSS_Responsive(10)" }
                if ($css -match 'hover') { $cssScore += 5; $details += "CSS_Interact(5)" }
                if ($css -match 'border-radius') { $cssScore += 5; $details += "CSS_Shapes(5)" }
            } catch {}
        }
        
        # Max score is 60 without CSS, 120 total roughly. We unique the details since they might double count
        # Let's just sum it up. Actually, regex matches on CSS might overlap with HTML if styles are inline.
        # It's a structural proxy!
        $total = $score + $cssScore
        $results += [PSCustomObject]@{ Name = $name; Url = $url; Score = $total; Details = ($details -join ", ") }
    } catch {
        $results += [PSCustomObject]@{ Name = $name; Url = $url; Score = -1; Details = "ERROR" }
    }
}

$results | Sort-Object Score -Descending | Format-Table -AutoSize | Out-File -FilePath "$env:TEMP\cv_scores.txt" -Encoding utf8
Write-Output "Scoring complete. Check $env:TEMP\cv_scores.txt"
