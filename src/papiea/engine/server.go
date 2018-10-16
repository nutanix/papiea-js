#import stuff

// Initialize Papiea
// Initialize papiea engine
func (papiea papiea) initialize() papiea, err {
    // Load databases
    papiea.status_db // initialize db connection
    papiea.spec_db // initialize db connection
    papiea.providers_db // initialize db connection

    // Sets up the rest api engine
    papiea.api = new rest.api()

    // Start admin facing apis
    papiea.admin_facing_apis()

    // Start providers facing apis
    papiea.provider_facing_api()

    // Start user facing apis
    papiea.user_facing_api()
}